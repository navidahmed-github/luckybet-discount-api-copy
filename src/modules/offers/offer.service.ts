import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, EventLog, id, JsonRpcApiProvider, Log, TransactionReceipt, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { MimeType, TransferType } from "../../common.types";
import { MONGO_DUPLICATE_KEY, OfferTokenIdError } from "../../error.types";
import { RawTransfer, Transfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IUserService } from "../user/user.types";
import { ITokenService } from "../tokens/token.types";
import { IOfferService, OfferHistoryDTO } from "./offer.types";

const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

@Injectable()
export class OfferService implements IOfferService, OnModuleInit, OnModuleDestroy {
    private readonly _logger = new Logger(OfferService.name);
    private readonly _provider: JsonRpcApiProvider;
    private readonly _userTableName: string;
    private _disableListener: boolean;
    private _offerEvent: Contract;

    constructor(
        @Inject(ProviderTokens.UserService)
        private _userService: IUserService,

        @Inject(ProviderTokens.TokenService)
        private _tokenService: ITokenService,

        @Inject(ProviderTokens.ContractService)
        private _contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,

        @InjectRepository(Transfer)
        private _transferRepository: MongoRepository<Transfer>,

        @InjectRepository(Template)
        private _templateRepository: MongoRepository<Template>,

        @InjectRepository(OfferImage)
        private _imageRepository: MongoRepository<OfferImage>,
    ) {
        this._userTableName = userRepository.metadata.tableName;
        this._provider = ethereumProviderService.getProvider();
    }

    public async onModuleInit() {
        this._disableListener = false;
        this._offerEvent = await this._contractService.offerContract();
        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._offerEvent.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        Promise.allSettled(evts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash)));
        this._offerEvent.on("Transfer", this.transferListener);
    }

    public async onModuleDestroy() {
        this._offerEvent?.off("Transfer", this.transferListener);
    }

    public async getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata> {
        const [template, overriden] = await this.getWithFallback(this._templateRepository, offerType, offerInstance);
        return template?.metadata ? { ...template.metadata, ...(detailed && { usesDefault: !overriden }) } : null;
    }

    public async getImage(offerType: number, offerInstance: number): Promise<OfferImage> {
        return (await this.getWithFallback(this._imageRepository, offerType, offerInstance))[0];
    }

    public async getOffers(userId: string): Promise<string[]> {
        this._logger.verbose(`Retrieving offers for user: ${userId}`);
        const wallet = await this._userService.getUserWallet(userId);
        const offer = await this._contractService.offerContract();
        return []; // !!
    }

    public async getHistory(userId: string): Promise<OfferHistoryDTO[]> {
        this._logger.verbose(`Retrieving offer history for user: ${userId}`);
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
                        { offer: { $exists: true } },
                        { $or: [{ fromAddress: wallet.address }, { toAddress: wallet.address }] }
                    ]
                }
            },
            lookupPipeline("from"),
            lookupPipeline("to"),
            { $sort: { blockTimestamp: 1 } }
        ]);
        return (await transfers.toArray()).map(toHistory).filter(Boolean);

        function toHistory(transfer: Transfer & { fromUser: User[], toUser: User[] }): OfferHistoryDTO | null {
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
            return { ...dto, ...transfer.offer, time: transfer.blockTimestamp };
        }
    }

    public async create(userId: string, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer> {
        this._logger.verbose(`Mint offer type: ${offerType} to: ${userId} spent: ${amount} tokens`);
        const admin = this._walletService.getAdminWallet();
        const offer = await this._contractService.offerContract(admin);
        let tx;

        const toAddress = this._walletService.getLuckyBetWalletAddress();
        if (amount > 0) {
            const transfer = await this._tokenService.transfer(userId, toAddress, amount, true);
            tx = await offer.mint(toAddress, offerType, transfer.txHash);
        } else {
            tx = await offer.mint(toAddress, BigInt(offerType));
        }
        return this.lockTransfer(async () => {
            const txReceipt: TransactionReceipt = await tx.wait();
            // !! need to check receipt status to check mined
            const tokenId = (txReceipt.logs.find(l => l.topics[0] === TRANSFER_TOPIC) as EventLog)?.args[2];
            if (!tokenId) {
                throw new OfferTokenIdError("Failed to read tokenID from event");
            }
            return this.saveTransfer(ZeroAddress, toAddress, tokenId, txReceipt.blockNumber, txReceipt.hash, additionalInfo);
        });
    }

    public async transfer(userId: string, toAddress: string, tokenId: bigint, asAdmin: boolean): Promise<RawTransfer> {
        this._logger.verbose(`Transfer token: ${tokenId} from user: ${userId} to: ${toAddress}`);
        const wallet = await this._userService.getUserWallet(userId);
        const offer = await this._contractService.offerContract(wallet);
        let tx;

        await this._walletService.gasWallet(wallet);
        if (asAdmin) {
            const adminWallet = this._walletService.getAdminWallet();
            const txApprove = await offer.setApprovalForAll(adminWallet.address, true);
            await txApprove.wait();
            const adminOffer = await this._contractService.offerContract(adminWallet);
            tx = await adminOffer.transferFrom(wallet.address, toAddress, tokenId);
        } else {
            tx = await offer.transferFrom(wallet.address, toAddress, tokenId);
        }
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(wallet.address, toAddress, tokenId, txReceipt.blockNumber, txReceipt.hash);
        });
    }

    public async createTemplate(offerType: number, metadata: Metadata, offerInstance?: number): Promise<void> {
        this._logger.verbose(`Create template for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const id = (await this._templateRepository.findOne({ where: { offerType, offerInstance } }))?.id;
        await this._templateRepository.save({ ...(id && { id }), offerType, metadata, ...(offerInstance && { offerInstance }) });
    }

    public async deleteTemplate(offerType: number, offerInstance?: number): Promise<void> {
        this._logger.verbose(`Delete template for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const existing = await this._templateRepository.findOne({ where: { offerType, offerInstance } });
        if (existing) {
            await this._templateRepository.delete(existing.id);
        }
    }

    public async uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void> {
        this._logger.verbose(`Upload ${format} for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const id = (await this._imageRepository.findOne({ where: { offerType, offerInstance } }))?.id;
        await this._imageRepository.save({ ...(id && { id }), offerType, format, data, ...(offerInstance && { offerInstance }) });
    }

    public async deleteImage(offerType: number, offerInstance?: number): Promise<void> {
        this._logger.verbose(`Delete image for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const existing = await this._imageRepository.findOne({ where: { offerType, offerInstance } });
        if (existing) {
            await this._imageRepository.delete(existing.id);
        }
    }

    private async getWithFallback<T>(repository: MongoRepository<T>, offerType: number, offerInstance: number): Promise<[T, boolean]> {
        const overriden = await repository.findOne({ where: { offerType, offerInstance } });
        return overriden ? [overriden, true] : [await repository.findOne({ where: { offerType, offerInstance: undefined } }), false];
    }

    private transferListener = async (from: string, to: string, tokenId: bigint, { log }: { log: Log }) => {
        if (!this._disableListener) {
            await this.saveTransfer(from, to, tokenId, log.blockNumber, log.transactionHash);
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
        tokenId: bigint,
        blockNumber: number,
        txHash: string,
        additionalInfo?: string
    ): Promise<RawTransfer> {
        const offer = Object.assign({ tokenId: `0x${tokenId.toString(16)}` }, !additionalInfo ? {} : { additionalInfo });
        const transfer = { fromAddress, toAddress, blockNumber, txHash, offer };
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
}
