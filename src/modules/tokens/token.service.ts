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
import { HistoryDTO, ITokenService, TransferType } from "./token.types";

@Injectable()
export class TokenService implements ITokenService, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TokenService.name);
    private readonly _provider: JsonRpcApiProvider;
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
    ) {
        this._provider = ethereumProviderService.getProvider();
    }

    transferListener = async (to, amount, from, evt) => {
        await this.processTransfer(to, amount, from, evt.blockNumber, evt.log.transactionHash);
    }

    public async onModuleInit() {
        this._tokenEvent = await this._contractService.tokenContract();

        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._tokenEvent.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        for (const evt of evts) {
            if ("args" in evt) {
                await this.processTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash);
            }
        }
        this._tokenEvent.on("Transfer", this.transferListener);
    }

    public async onModuleDestroy() {
        this._tokenEvent.off("Transfer", this.transferListener);
    }

    public async getBalance(userId: string): Promise<bigint> {
        const wallet = await this._userService.getUserWallet(userId);
        const token = await this._contractService.tokenContract();
        return BigInt(await token.balanceOf(wallet.address));
    }

    public async getHistory(userId: string): Promise<HistoryDTO[]> {
        const wallet = await this._userService.getUserWallet(userId);
        const transfers = await this._transferRepository.find({
            where: [
                { offer: { $exists: true } },
                { $or: [{ from: wallet.address }, { to: wallet.address }] }
            ],
            order: { blockTimestamp: "ASC" }
        });
        return transfers.map(toHistory);

        function toHistory(transfer: Transfer): HistoryDTO {
            const common = { amount: transfer.token.amount.toString(), time: transfer.blockTimestamp };
            if (transfer.to == wallet.address) {
                if (transfer.from == ZeroAddress) {
                    return { ...common, type: TransferType.Mint };
                };
                // !! need to get user by address
                return { ...common, type: TransferType.Receive, otherAddress: transfer.from };
            }
            if (transfer.from == wallet.address) {
                if (transfer.to == ZeroAddress) {
                    return { ...common, type: TransferType.Burn };
                };
                return { ...common, type: TransferType.Send, otherAddress: transfer.to };
            }
            throw new Error("Invalid transfer"); // !! clean-up
        }
    }

    public async transfer(userId: string, toAddress: string, amount: bigint): Promise<void> {
        const wallet = await this._userService.getUserWallet(userId);
        const token = await this._contractService.tokenContract(wallet);
        const tx = await token.transfer(toAddress, amount);
        const txReceipt = await tx.wait();
        await this.writeTransfer(wallet.address, toAddress, amount, txReceipt);
    }

    public async mint(toAddress: string, amount: bigint): Promise<void> {
        const admin = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(admin);
        const tx = await token.mint(toAddress, amount);
        const txReceipt = await tx.wait();
        await this.writeTransfer(ZeroAddress, toAddress, amount, txReceipt);
    }

    private async processTransfer(from, to, amount, blockNumber, txHash) {
        try {
            if (!await this._transferRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                await this._transferRepository.save({ from, to, blockNumber, blockTimestamp, txHash, token: { amount } });
            }
        } catch (err) {
            console.error(err);
        }
    }

    private async writeTransfer(fromAddress: string, toAddress: string, amount: bigint, txReceipt: TransactionReceipt) {
        const blockTimestamp = (await txReceipt.getBlock()).timestamp;
        return this._transferRepository.save({
            fromAddress, toAddress, blockNumber: txReceipt.blockNumber, blockTimestamp, txHash: txReceipt.hash, token: { amount }
        });
    }
}
