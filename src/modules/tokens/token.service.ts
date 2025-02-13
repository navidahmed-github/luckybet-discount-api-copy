import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, JsonRpcApiProvider, Log, Wallet, ZeroAddress } from "ethers";
import { v4 as uuid_v4 } from 'uuid';
import { ProviderTokens } from "../../providerTokens";
import { IDestination, ISource, OperationStatus, TransferType } from "../../common.types";
import { AirdropNotFoundError, DestinationInvalidError, InsufficientBalanceError, MONGO_DUPLICATE_KEY } from "../../error.types";
import { RawTransfer, Transfer } from "../../entities/transfer.entity";
import { AirdropChunk } from "../../entities/airdrop.entity";
import { User } from "../../entities/user.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IUserService } from "../user/user.types";
import { IJobService } from "../job/job.types";
import { TokenHistoryDTO, ITokenService, AirdropStatus } from "./token.types";

const AIRDROP_MAX_MINT_PER_TX = 10;
const AIRDROP_JOB_NAME = "airdropTask";

@Injectable()
export class TokenService implements ITokenService, OnApplicationBootstrap, OnModuleInit, OnModuleDestroy {
    private readonly _logger = new Logger(TokenService.name);
    private readonly _provider: JsonRpcApiProvider;
    private readonly _userTableName: string;
    private _disableListener: boolean;
    private _tokenEvent: Contract;

    constructor(
        @Inject(ProviderTokens.UserService)
        private _userService: IUserService,

        @Inject(ProviderTokens.JobService)
        private _jobService: IJobService,

        @Inject(ProviderTokens.ContractService)
        private _contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(Transfer)
        private _transferRepository: MongoRepository<Transfer>,

        @InjectRepository(AirdropChunk)
        private _airdropRepository: MongoRepository<AirdropChunk>,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,
    ) {
        this._userTableName = userRepository.metadata.tableName;
        this._provider = ethereumProviderService.getProvider();
    }

    public async onModuleInit() {
        this._disableListener = false;
        this._tokenEvent = await this._contractService.tokenContract();
        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._tokenEvent.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        Promise.allSettled(evts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash)));
        this._tokenEvent.on("Transfer", this.transferListener);
    }

    public async onApplicationBootstrap() {
        await this._jobService.define(AIRDROP_JOB_NAME, this.airdropProcessor);
    }

    public async onModuleDestroy() {
        this._tokenEvent?.off("Transfer", this.transferListener);
    }

    public async getBalance(dest: IDestination): Promise<bigint> {
        const [address] = await this.parseDestination(dest);
        this._logger.verbose(`Retrieving balance for address: ${address}`);
        const token = await this._contractService.tokenContract();
        return await token.balanceOf(address);
    }

    public async getHistory(dest: IDestination): Promise<TokenHistoryDTO[]> {
        const [address] = await this.parseDestination(dest);
        this._logger.verbose(`Retrieving token history for address: ${address}`);
        const lookupPipeline = (prefix: string) => {
            return {
                $lookup: {
                    from: this._userTableName,
                    localField: `${prefix}Address`,
                    foreignField: "address",
                    as: `${prefix}User`
                }
            }
        };
        const transfers = this._transferRepository.aggregate([
            {
                $match: {
                    $and: [
                        { token: { $exists: true } },
                        { $or: [{ fromAddress: address }, { toAddress: address }] }
                    ]
                }
            },
            lookupPipeline("from"),
            lookupPipeline("to"),
            { $sort: { blockTimestamp: 1 } }
        ]);
        return (await transfers.toArray()).map(toHistory).filter(Boolean);

        function toHistory(transfer: Transfer & { fromUser: User[], toUser: User[] }): TokenHistoryDTO | null {
            let dto = null;
            if (transfer.toAddress == address) {
                const otherUser = transfer.fromUser.length ? { otherUser: transfer.fromUser[0].userId } : {};
                dto = (transfer.fromAddress == ZeroAddress) ?
                    { type: TransferType.Mint } :
                    { type: TransferType.Receive, otherAddress: transfer.fromAddress, ...otherUser };
            }
            if (transfer.fromAddress == address) {
                const otherUser = transfer.toUser.length ? { otherUser: transfer.toUser[0].userId } : {};
                dto = (transfer.toAddress == ZeroAddress) ?
                    { type: TransferType.Burn } :
                    { type: TransferType.Send, otherAddress: transfer.toAddress, ...otherUser };
            }
            if (!dto) {
                this._logger.error(`Failed to parse history record with txHash: ${transfer.txHash}`);
                return null;
            }
            return { ...dto, amount: transfer.token.amount, timestamp: transfer.blockTimestamp };
        }
    }

    public async create(to: IDestination, amount: bigint): Promise<RawTransfer> {
        const [toAddress] = await this.parseDestination(to);
        this._logger.verbose(`Mint tokens to: ${toAddress} amount: ${amount}`);
        const admin = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(admin);
        const tx = await token.mint(toAddress, amount);
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(ZeroAddress, toAddress, amount, txReceipt.blockNumber, txReceipt.hash);
        });
    }

    public async destroy(amount: bigint): Promise<void> {
        this._logger.verbose(`Burn tokens from Lucky Bet wallet for amount: ${amount}`);
        const wallet = this._walletService.getLuckyBetWallet();
        const token = await this._contractService.tokenContract(wallet);

        const balance = await token.balanceOf(wallet.address);
        if (balance < amount) {
            throw new InsufficientBalanceError(`Attempting to burn ${amount} tokens when only ${balance} available`);
        }

        await this._walletService.gasWallet(wallet);
        const tx = await token.burn(amount);
        await this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(wallet.address, ZeroAddress, amount, txReceipt.blockNumber, txReceipt.hash);
        });
    }

    public async transfer(from: ISource, to: IDestination, amount: bigint): Promise<RawTransfer> {
        const [toAddress] = await this.parseDestination(to);
        this._logger.verbose(`Transfer tokens from user: ${from.userId} to: ${toAddress} amount: ${amount}`);
        const wallet = await this._userService.getUserWallet(from.userId);
        const token = await this._contractService.tokenContract(wallet);
        let tx;

        const balance = await token.balanceOf(wallet.address);
        if (balance < amount) {
            throw new InsufficientBalanceError(`Attempting to transfer ${amount} tokens when only ${balance} available`);
        }

        await this._walletService.gasWallet(wallet);
        if (from.asAdmin) {
            const adminWallet = this._walletService.getAdminWallet();
            const txApprove = await token.approve(adminWallet.address, amount);
            await txApprove.wait();
            const adminToken = await this._contractService.tokenContract(adminWallet);
            tx = await adminToken.transferFrom(wallet.address, toAddress, amount);
        } else {
            tx = await token.transfer(toAddress, amount);
        }
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(wallet.address, toAddress, amount, txReceipt.blockNumber, txReceipt.hash);
        });
    }

    public async airdrop(destinations: IDestination[], amount: bigint): Promise<string> {
        if (!destinations.length) {
            throw new DestinationInvalidError("At least one destination is required");
        }
        if (destinations.some(d => d.address && d.userId)) {
            throw new DestinationInvalidError("Cannot provide both user and address as destination");
        }
        if (destinations.some(d => !d.address && !d.userId)) { // !! should check valid Ethereum address
            throw new DestinationInvalidError("A user or valid address is required as a destination");
        }

        const users = await this._userService.getAll();
        const addressMap = new Map(users.map(u => [u.id, u.address]));
        const [valid, invalid] = destinations
            .map(d => d.userId ? { ...destinations, address: d ?? addressMap.get(d.userId) } : d)
            .reduce(([v, i], curr) => curr.address ? [[...v, curr], i] : [v, [...i, curr]], [[], []]);

        const requestId = uuid_v4();
        try {
            while (valid.length) {
                const chunkAddresses = valid.splice(0, AIRDROP_MAX_MINT_PER_TX);
                this._airdropRepository.save({
                    requestId,
                    status: OperationStatus.Pending,
                    amount: amount.toString(),
                    destinations: chunkAddresses
                });
            }
            if (invalid.length) {
                this._airdropRepository.save({
                    requestId,
                    status: OperationStatus.Error,
                    error: "Users not found",
                    amount: amount.toString(),
                    destinations: invalid
                });
            }
            await this._jobService.run(AIRDROP_JOB_NAME, requestId);
            return requestId;
        } catch (err) {
            // operation has failed therefore make best attempt to delete all chunks
            // !! test this
            await this._airdropRepository.delete({ requestId }).catch(_ => this._logger.error(`Deleting airdrop records failed for request: ${requestId}`));
            throw new Error(); // !!
        }
    }

    public async airdropStatus(requestId: string): Promise<AirdropStatus> {
        const chunks = await this._airdropRepository.find({ where: { requestId } });
        if (!chunks.length) {
            throw new AirdropNotFoundError(requestId);
        }
        if (chunks.every(c => [OperationStatus.Error, OperationStatus.Complete].includes(c.status))) {
            const errorChunks = chunks.filter(c => c.status == OperationStatus.Error);
            if (!errorChunks.length) {
                return { status: OperationStatus.Complete };
            }
            const errors = errorChunks.flatMap(c => c.destinations.map(d => { return { ...d, reason: c.error } }));
            return { status: OperationStatus.Error, errors }
        }
        return { status: OperationStatus.Processing };
    }

    private airdropProcessor = async (requestId: string, touch: () => Promise<void>) => {
        const admin = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(admin);
        const chunks = await this._airdropRepository.find({ where: { requestId } });

        // check whether any chunks are partially processed, this should only happen if the server is stopped and
        // restarted while in the middle of processing a job
        for (const processing of chunks.filter(c => c.status == OperationStatus.Processing)) {
            try {
                this._logger.verbose(`Recovering airdrop chunk: ${processing.id} with requestId: ${requestId}`);
                await touch();
                if (processing.txHash) {
                    // the request was submitted to chain so wait for response and use status to set final result
                    const txReceipt = await this._provider.waitForTransaction(processing.txHash);
                    if (txReceipt?.status > 0) {
                        await this._airdropRepository.update(processing.id, { status: OperationStatus.Complete });
                    } else {
                        throw new Error("Contract call reverted");
                    }
                } else {
                    // the request was never submitted to chain so can treat as though it was never started
                    await this._airdropRepository.update(processing.id, { status: OperationStatus.Pending });
                }
            } catch (err) {
                const error = `Failed to process airdrop chunk: ${processing.id}, reason: ${err.message}`;
                this._logger.error(error, err.stack);
                await this._airdropRepository.update(processing.id, { status: OperationStatus.Error, error })
                    .catch(_ => this._logger.error(`Updating airdrop records failed for request: ${requestId}`));
            }
        }

        // job service ensures that only one instance of this task is running at any one time
        for (const pending of chunks.filter(c => c.status == OperationStatus.Pending)) {
            try {
                this._logger.verbose(`Processing airdrop chunk: ${pending.id} with requestId: ${requestId}`);
                await touch();
                await this._airdropRepository.update(pending.id, { status: OperationStatus.Processing });
                const tx = await token.mintMany(pending.destinations.map(d => d.address), BigInt(pending.amount));
                await this._airdropRepository.update(pending.id, { txHash: tx.hash });
                await tx.wait();
                await this._airdropRepository.update(pending.id, { status: OperationStatus.Complete });
                this._logger.verbose(`Processed airdrop chunk: ${pending.id}`);
            } catch (err) {
                const error = `Failed to process airdrop chunk: ${pending.id}, reason: ${err.message}`;
                this._logger.error(error, err.stack);
                await this._airdropRepository.update(pending.id, { status: OperationStatus.Error, error })
                    .catch(_ => this._logger.error(`Updating airdrop records failed for request: ${requestId}`));
            }
        }
    }

    private transferListener = async (from: string, to: string, value: bigint, { log }: { log: Log }) => {
        if (!this._disableListener) {
            await this.saveTransfer(from, to, value, log.blockNumber, log.transactionHash);
        }
    }

    private async lockTransfer<T>(fn: () => Promise<T>): Promise<T> {
        try {
            this._disableListener = true;
            return await fn();
        } finally {
            this._disableListener = false;
        }
    }

    private async saveTransfer(
        fromAddress: string,
        toAddress: string,
        amount: bigint,
        blockNumber: number,
        txHash: string
    ): Promise<RawTransfer> {
        const transfer = { fromAddress, toAddress, blockNumber, txHash, token: { amount: amount.toString() } };
        try {
            if (!await this._transferRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                return await this._transferRepository.save({ ...transfer, blockTimestamp });
            }
        } catch (err) {
            if (!(err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)) // ignore if already exists
                this._logger.error(`Failed to write transfer with txHash: ${txHash}, reason: ${err.messsage}`, err.stack);
        }
        return transfer;
    }

    private async parseDestination(to: IDestination): Promise<[string, Wallet?]> {
        if (to.userId) {
            if (to.address)
                throw new DestinationInvalidError("Cannot provide both user and address as destination");
            const wallet = await this._userService.getUserWallet(to.userId);
            return [wallet.address, wallet];
        }
        if (!to.address)
            throw new DestinationInvalidError("No destination provided");
        return [to.address, null];
    }

}
