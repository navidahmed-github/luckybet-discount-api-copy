import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, isAddress, ZeroAddress } from "ethers";
import { v4 as uuid_v4 } from 'uuid';
import { ProviderTokens } from "../../providerTokens";
import { awaitSeconds, callContract, fromTokenNative, IDestination, ISource, OperationStatus, parseDestination, toAdminString, toNumberSafe, toTokenNative } from "../../common.types";
import { AirdropCannotCreateError, AirdropNotFoundError, DestinationInvalidError, InsufficientBalanceError } from "../../error.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { AirdropChunk } from "../../entities/airdrop.entity";
import { User } from "../../entities/user.entity";
import { TransferService } from "../../services/transfer.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IJobService } from "../job/job.types";
import { AirdropDTO, AirdropStatusDTO, ITokenService, TokenHistoryDTO, TokenSummaryDTO } from "./token.types";

const LUCKYBET_WALLET_ID = "luckybet-internal";
const AIRDROP_DEFAULT_CHUNK_SIZE = 100;
const AIRDROP_JOB_NAME = "airdropTask";

export enum TokenServiceSettingKeys {
    AIRDROP_CHUNK_SIZE = "AIRDROP_CHUNK_SIZE",
}

@Injectable()
export class TokenService extends TransferService<TokenHistoryDTO> implements ITokenService, OnApplicationBootstrap {
    constructor(
        config: ConfigService,

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
        super(new Logger(TokenService.name), config, ethereumProviderService, userRepository);
    }

    public async onApplicationBootstrap() {
        await this._jobService.define(AIRDROP_JOB_NAME, this.airdropProcessor);
    }

    public async getSummary(): Promise<TokenSummaryDTO> {
        const token = await this._contractService.tokenContract();
        const transferSummary = await super.getSummary("token");
        const totalSupply = toNumberSafe(await token.totalSupply());
        const totalMinted = await this.getAmountTotals({ fromAddress: ZeroAddress });
        const totalBurnt = await this.getAmountTotals({ toAddress: ZeroAddress });
        return { ...transferSummary, totalSupply, totalMinted, totalBurnt };
    }

    public async getBalance(dest: IDestination): Promise<bigint> {
        const address = (dest.userId === LUCKYBET_WALLET_ID) ?
            this._walletService.getLuckyBetWallet().address :
            (await parseDestination(this._userService, dest))[0];
        this._logger.verbose(`Retrieving balance for address: ${address}`);
        const token = await this._contractService.tokenContract();
        return await token.balanceOf(address);
    }

    public async getHistory(dest: IDestination): Promise<TokenHistoryDTO[]> {
        return super.getHistory(dest, "token", async t => ({ amount: fromTokenNative(BigInt(t.token.amount)) }))
    }

    public async create(to: IDestination, amount: bigint): Promise<RawTransfer> {
        const [toAddress] = await parseDestination(this._userService, to);
        this._logger.verbose(`Mint tokens to: ${toAddress}, amount: ${amount}`);
        const adminWallet = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(adminWallet);

        await this._walletService.gasWallet(adminWallet);
        const tx = await callContract(() => token.mint(toAddress, amount), token);
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
        const tx = await callContract(() => token.burn(amount), token);
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
            const txApprove = await callContract(() => token.approve(adminWallet.address, amount), token);
            await txApprove.wait();
            const adminToken = await this._contractService.tokenContract(adminWallet);
            tx = await callContract(() => adminToken.transferFrom(wallet.address, toAddress, amount), adminToken);
        } else {
            tx = await callContract(() => token.transfer(toAddress, amount), token);
        }
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(wallet.address, toAddress, amount, txReceipt.blockNumber, txReceipt.hash);
        });
    }

    public async airdropGetAll(): Promise<AirdropDTO[]> {
        const requests = await this._airdropRepository.aggregate([
            {
                $group: {
                    _id: "$requestId",
                    amount: { $first: "$amount" },
                    destinationLists: { $push: "$destinations" },
                    statuses: { $push: "$status" },
                    timestamp: { $min: "$createdAt" }
                }
            }
        ]).toArray() as any;
        return requests.map(r => {
            let status = OperationStatus.Processing;
            if (r.statuses.every(s => [OperationStatus.Error, OperationStatus.Complete].includes(s))) {
                status = r.statuses.includes(OperationStatus.Error) ? OperationStatus.Error : OperationStatus.Complete;
            }
            const destinationCount = r.destinationLists.reduce((acc, curr) => acc + curr.length, 0);
            return { requestId: r._id, amount: r.amount, destinationCount, status, timestamp: new Date(r.timestamp).valueOf() }
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
        const addressMap = new Map<string, string>(users.map(u => [u.userId, u.address]));
        const [validUsers, invalidUsers] = destinations
            .map(d => d.userId ? { ...d, address: addressMap.get(d.userId) } : d)
            .reduce(([v, i], curr) => curr.address ? [[...v, curr], i] : [v, [...i, curr]], [[], []]);

        // only one transfer event can be generated per address per transaction; rather than attempting to combine
        // events we will not allow duplicates which makes more sense
        const duplicateMap = new Map<string, IDestination[]>();
        validUsers.forEach(d => duplicateMap.set(d.address, [...(duplicateMap.get(d.address) ?? []), d]));
        const [valid, duplicates] = Array.from(duplicateMap.values())
            .reduce(([v, d], curr) => [[...v, curr[0]], curr.length == 1 ? d : [...d, curr[0]]], [[], []]);

        const requestId = uuid_v4();
        const chunkSize = Number(this._config.get(TokenServiceSettingKeys.AIRDROP_CHUNK_SIZE) ?? AIRDROP_DEFAULT_CHUNK_SIZE);
        try {
            while (valid.length) {
                const chunkAddresses = valid.splice(0, chunkSize);
                this._airdropRepository.save({
                    requestId,
                    status: OperationStatus.Pending,
                    amount: amount.toString(),
                    destinations: chunkAddresses
                });
            }
            if (invalidUsers.length) {
                this._airdropRepository.save({
                    requestId,
                    status: OperationStatus.Error,
                    error: "User not found",
                    amount: amount.toString(),
                    destinations: invalidUsers
                });
            }
            if (duplicates.length) {
                this._airdropRepository.save({
                    requestId,
                    status: OperationStatus.Error,
                    error: "Duplicate address",
                    amount: amount.toString(),
                    destinations: duplicates
                });
            }
            await this._jobService.run(AIRDROP_JOB_NAME, requestId);
            return requestId;
        } catch (err) {
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
                const amount = BigInt(pending.amount);
                const tx = await callContract(() => token.mintMany(pending.destinations.map(d => d.address), amount), token);
                await this.lockTransfer(async () => {
                    await this._airdropRepository.update(pending.id, { txHash: tx.hash });
                    const txReceipt = await tx.wait();
                    return await Promise.allSettled(pending.destinations.map(async d =>
                        this.saveTransfer(ZeroAddress, d.address, amount, txReceipt.blockNumber, txReceipt.hash)));
                });
                await this._airdropRepository.update(pending.id, { status: OperationStatus.Complete });
                this._logger.verbose(`Processed airdrop chunk: ${pending.id}`);
                await awaitSeconds(5);
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

    private async getAmountTotals(addressClause: any) {
        return fromTokenNative((await this._transferRepository.aggregate([
            { $match: { $and: [{ token: { $exists: true } }, addressClause] } },
            { $project: { "token.amount": 1 } },
        ]).toArray()).map(t => BigInt(t.token.amount)).reduce((acc, curr) => acc + curr, 0n));
    }
}
