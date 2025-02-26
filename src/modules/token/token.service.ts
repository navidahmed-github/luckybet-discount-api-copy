import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, isAddress, ZeroAddress } from "ethers";
import { v4 as uuid_v4 } from 'uuid';
import { ProviderTokens } from "../../providerTokens";
import { fromTokenNative, IDestination, ISource, OperationStatus, parseDestination, toAdminString, toTokenNative } from "../../common.types";
import { AirdropCannotCreateError, AirdropNotFoundError, DestinationInvalidError, InsufficientBalanceError } from "../../error.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { AirdropChunk } from "../../entities/airdrop.entity";
import { User } from "../../entities/user.entity";
import { TransferService } from "../../services/transfer.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IJobService } from "../job/job.types";
import { TokenHistoryDTO, ITokenService, AirdropStatusDTO } from "./token.types";

const AIRDROP_MAX_MINT_PER_TX = 10;
const AIRDROP_JOB_NAME = "airdropTask";

@Injectable()
export class TokenService extends TransferService<TokenHistoryDTO> implements ITokenService, OnApplicationBootstrap {
    constructor(
        @Inject(ProviderTokens.JobService)
        private readonly _jobService: IJobService,

        @Inject(ProviderTokens.WalletService)
        private readonly _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,

        @InjectRepository(AirdropChunk)
        private readonly _airdropRepository: MongoRepository<AirdropChunk>
    ) {
        super(new Logger(TokenService.name), ethereumProviderService, userRepository);
    }

    public async onApplicationBootstrap() {
        await this._jobService.define(AIRDROP_JOB_NAME, this.airdropProcessor);
    }

    public async getBalance(dest: IDestination): Promise<bigint> {
        const [address] = await parseDestination(this._userService, dest);
        this._logger.verbose(`Retrieving balance for address: ${address}`);
        const token = await this._contractService.tokenContract();
        return await token.balanceOf(address);
    }

    public async getHistory(dest: IDestination): Promise<TokenHistoryDTO[]> {
        return super.getHistory(dest, "token", t => ({ amount: fromTokenNative(BigInt(t.token.amount)) }))
    }

    public async create(to: IDestination, amount: bigint): Promise<RawTransfer> {
        const [toAddress] = await parseDestination(this._userService, to);
        this._logger.verbose(`Mint tokens to: ${toAddress}, amount: ${amount}`);
        const adminWallet = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(adminWallet);

        await this._walletService.gasWallet(adminWallet);
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
        const [toAddress] = await parseDestination(this._userService, to);
        this._logger.verbose(`Transfer tokens from user: ${from.userId}, to: ${toAddress}, amount: ${amount} ${toAdminString(from)}`);
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
            await this._walletService.gasWallet(adminWallet);
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
        if (destinations.some(d => !d.address && !d.userId)) {
            throw new DestinationInvalidError("A user or valid address is required as a destination");
        }
        const invalidFormat = destinations.filter(d => d.address).find(d => !isAddress(d.address));
        if (invalidFormat) {
            throw new DestinationInvalidError(`Not a valid Ethereum address: ${invalidFormat.address}`)
        }

        const users = await this._userService.getAll();
        const addressMap = new Map(users.map(u => [u.userId, u.address]));
        const [valid, invalid] = destinations
            .map(d => d.userId ? { ...d, address: addressMap.get(d.userId) } : d)
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
            // !! test this
            // operation has failed therefore make best attempt to delete all chunks
            await this._airdropRepository.delete({ requestId }).catch(_ => this._logger.error(`Deleting airdrop records failed for request: ${requestId}`));
            throw new AirdropCannotCreateError(err.message);
        }
    }

    public async airdropStatus(requestId: string): Promise<AirdropStatusDTO> {
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
        const adminWallet = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(adminWallet);
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
                await this._walletService.gasWallet(adminWallet);
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

    protected async getContract(): Promise<Contract> {
        return this._contractService.tokenContract();
    }

    protected addTransferData(transfer: Omit<RawTransfer, "token" | "offer">, value: bigint, _args: any[]): RawTransfer {
        return { ...transfer, token: { amount: value.toString() } };
    }
}
