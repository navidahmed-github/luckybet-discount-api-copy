import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, JsonRpcApiProvider, Log, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { MONGO_DUPLICATE_KEY } from "../../error.types";
import { Transfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { EthereumProviderService } from "../../services/ethereumProvider.service";
import { IUserService } from "../user/user.types";
import { HistoryDTO, ITokenService, TransferType } from "./token.types";

@Injectable()
export class TokenService implements ITokenService, OnModuleInit, OnModuleDestroy {
    private readonly _logger = new Logger(TokenService.name);
    private readonly _provider: JsonRpcApiProvider;
    private readonly _userTableName: string;
    private _tokenEvent: Contract;

    constructor(
        @Inject(ProviderTokens.UserService)
        private _userService: IUserService,

        @Inject(ProviderTokens.ContractService)
        private _contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: EthereumProviderService,

        @InjectRepository(Transfer)
        private _transferRepository: MongoRepository<Transfer>,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,
    ) {
        this._userTableName = userRepository.metadata.tableName;
        this._provider = ethereumProviderService.getProvider();
    }

    public async onModuleInit() {
        this._tokenEvent = await this._contractService.tokenContract();
        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._tokenEvent.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        Promise.allSettled(evts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash)));
        this._tokenEvent.on("Transfer", this.transferListener);
    }

    public async onModuleDestroy() {
        this._tokenEvent?.off("Transfer", this.transferListener);
    }

    public async getBalance(userId: string): Promise<bigint> {
        this._logger.verbose(`Retrieving balance for user: ${userId}`);
        const wallet = await this._userService.getUserWallet(userId);
        const token = await this._contractService.tokenContract();
        return await token.balanceOf(wallet.address);
    }

    public async getHistory(userId: string): Promise<HistoryDTO[]> {
        this._logger.verbose(`Retrieving history for user: ${userId}`);
        const wallet = await this._userService.getUserWallet(userId);
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
                        { $or: [{ fromAddress: wallet.address }, { toAddress: wallet.address }] }
                    ]
                }
            },
            lookupPipeline("from"),
            lookupPipeline("to"),
            { $sort: { blockTimestamp: 1 } }
        ]);
        return (await transfers.toArray()).map(toHistory).filter(Boolean);

        function toHistory(transfer: Transfer & { fromUser: User[], toUser: User[] }): HistoryDTO | null {
            let dto = null;
            if (transfer.toAddress == wallet.address) {
                const otherUser = transfer.fromUser.length ? { otherUser: transfer.fromUser[0].userId } : {};
                dto = (transfer.fromAddress == ZeroAddress) ?
                    { type: TransferType.Mint } :
                    { type: TransferType.Receive, otherAddress: transfer.fromAddress, ...otherUser };
            }
            if (transfer.fromAddress == wallet.address) {
                const otherUser = transfer.toUser.length ? { otherUser: transfer.toUser[0].userId } : {};
                dto = (transfer.toAddress == ZeroAddress) ?
                    { type: TransferType.Burn } :
                    { type: TransferType.Send, otherAddress: transfer.toAddress, ...otherUser };
            }
            if (!dto) {
                this._logger.error(`Failed to parse history record with txHash: ${transfer.txHash}`);
                return null;
            }
            return { ...dto, amount: transfer.token.amount.toString(), time: transfer.blockTimestamp };
        }
    }

    public async transfer(userId: string, toAddress: string, amount: bigint, asAdmin: boolean): Promise<void> {
        this._logger.verbose(`Transfer tokens from user: ${userId} to: ${toAddress} amount: ${amount}`);
        const wallet = await this._userService.getUserWallet(userId);
        const token = await this._contractService.tokenContract(wallet);
        let tx;

        await this._walletService.gasWallet(wallet);
        if (asAdmin) {
            const adminWallet = this._walletService.getAdminWallet();
            const txApprove = await token.approve(adminWallet.address, amount);
            await txApprove.wait();
            const adminToken = await this._contractService.tokenContract(adminWallet);
            tx = await adminToken.transferFrom(wallet.address, toAddress, amount);
        } else {
            tx = await token.transfer(toAddress, amount);
        }
        const txReceipt = await tx.wait();
        await this.saveTransfer(wallet.address, toAddress, amount, txReceipt.blockNumber, txReceipt.hash);
    }

    public async mint(toAddress: string, amount: bigint): Promise<void> {
        this._logger.verbose(`Mint tokens to: ${toAddress} amount: ${amount}`);
        const admin = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(admin);
        const tx = await token.mint(toAddress, amount);
        const txReceipt = await tx.wait();
        await this.saveTransfer(ZeroAddress, toAddress, amount, txReceipt.blockNumber, txReceipt.hash);
    }

    private transferListener = async (from: string, to: string, value: bigint, { log }: { log: Log }) => {
        await this.saveTransfer(from, to, value, log.blockNumber, log.transactionHash);
    }

    private async saveTransfer(fromAddress: string, toAddress: string, amount: bigint, blockNumber: number, txHash: string) {
        try {
            if (!await this._transferRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                return await this._transferRepository.save(
                    { fromAddress, toAddress, blockNumber, blockTimestamp, txHash, token: { amount } }
                );
            }
        } catch (err) {
            if (!(err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)) // ignore if already exists
                this._logger.error(`Failed to write transfer with txHash: ${txHash}, reason: ${err.messsage}`, err.stack);
        }
        return null;
    }
}
