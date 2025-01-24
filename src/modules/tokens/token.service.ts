import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, JsonRpcApiProvider, TransactionReceipt, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { Transfer } from "../../entities/transfer.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { EthereumProviderService } from "../../services/ethereumProvider.service";
import { IUserService } from "../user/user.types";
import { HistoryDTO, ITokenService } from "./token.types";

@Injectable()
export class TokenService implements ITokenService, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TokenService.name);
    private readonly _provider: JsonRpcApiProvider;
    private _tokenEvent: Contract;

    constructor(
        @Inject(ProviderTokens.UserService)
        private userService: IUserService,

        @Inject(ProviderTokens.ContractService)
        private contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: EthereumProviderService,

        @InjectRepository(Transfer)
        private transferRepository: MongoRepository<Transfer>,
    ) {
        this._provider = ethereumProviderService.getProvider();
    }

    transferListener = async (to, amount, from, evt) => {
        await this.processTransfer(to, amount, from, evt.blockNumber, evt.log.transactionHash);
    }

    async onModuleInit() {
        this._tokenEvent = await this.contractService.tokenContract();

        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._tokenEvent.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        for (const evt of evts) {
            if ("args" in evt) {
                await this.processTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash);
            }
        }
        this._tokenEvent.on("Transfer", this.transferListener);
    }

    async onModuleDestroy() {
        this._tokenEvent.off("Transfer", this.transferListener);
    }

    public async getBalance(userId: string): Promise<bigint> {
        const wallet = await this.userService.getUserWallet(userId);
        const token = await this.contractService.tokenContract();
        return BigInt(await token.balanceOf(wallet.address));
    }

    public async getHistory(userId: string): Promise<HistoryDTO[]> {
        const wallet = await this.userService.getUserWallet(userId);
        const transfers = await this.transferRepository.find({
            where: [
                { offer: { $exists: true } },
                { $or: [{ from: wallet.address }, { to: wallet.address }] }
            ],
            order: { blockTimestamp: "ASC" }
        });
        return transfers.map(t => Object.assign(
            { amount: t.token.amount.toString(), time: t.blockTimestamp },
            t.from == ZeroAddress ? { from: t.from } : {},
            t.to == ZeroAddress ? { to: t.to } : {}
        ));
    }

    public async transfer(userId: string, toAddress: string, amount: bigint): Promise<void> {
        const wallet = await this.userService.getUserWallet(userId);
        const token = await this.contractService.tokenContract(wallet);
        const tx = await token.transfer(toAddress, amount);
        const txReceipt = await tx.wait();
        await this.writeTransfer(wallet.address, toAddress, amount, txReceipt);
    }

    public async mint(toAddress: string, amount: bigint): Promise<void> {
        const admin = this.walletService.getAdminWallet();
        const token = await this.contractService.tokenContract(admin);
        const tx = await token.mint(toAddress, amount);
        const txReceipt = await tx.wait();
        await this.writeTransfer(ZeroAddress, toAddress, amount, txReceipt);
    }

    private async processTransfer(from, to, amount, blockNumber, txHash) {
        try {
            if (!await this.transferRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                await this.transferRepository.save({ from, to, blockNumber, blockTimestamp, txHash, token: { amount } });
            }
        } catch (err) {
            console.error(err);
        }
    }

    private async writeTransfer(fromAddress: string, toAddress: string, amount: bigint, txReceipt: TransactionReceipt) {
        const blockTimestamp = (await txReceipt.getBlock()).timestamp;
        return this.transferRepository.save({
            fromAddress, toAddress, blockNumber: txReceipt.blockNumber, blockTimestamp, txHash: txReceipt.hash, token: { amount }
        });
    }
}
