import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, EventLog, id, JsonRpcApiProvider, Log, TransactionReceipt, Wallet, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { IDestination, ISource, MimeType, TransferType } from "../../common.types";
import { DestinationInvalidError, InsufficientBalanceError, MONGO_DUPLICATE_KEY, NotApprovedError, OfferTokenIdError } from "../../error.types";
import { RawTransfer, Transfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IUserService } from "../user/user.types";
import { IOfferService, OfferHistoryDTO } from "./offer.types";

export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

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
        // !! return additonalInfo
        return template?.metadata ? { ...template.metadata, ...(detailed && { usesDefault: !overriden }) } : null;
    }

    public async getImage(offerType: number, offerInstance: number): Promise<OfferImage> {
        return (await this.getWithFallback(this._imageRepository, offerType, offerInstance))[0];
    }

    public async getOffers(dest: IDestination): Promise<bigint[]> {
        const [address] = await this.parseDestination(dest);
        this._logger.verbose(`Retrieving offers for address: ${address}`);
        const offer = await this._contractService.offerContract();
        const balance = await offer.balanceOf(address);
        const offers = [];

        for (let i = 0; i < balance; i++) {
            offers.push(await offer.tokenOfOwnerByIndex(address, i));
        }
        return offers;
    }

    public async getHistory(dest: IDestination): Promise<OfferHistoryDTO[]> {
        const [address] = await this.parseDestination(dest);
        this._logger.verbose(`Retrieving offer history for address: ${address}`);
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
                        { $or: [{ fromAddress: address }, { toAddress: address }] }
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
            return { ...dto, ...transfer.offer, time: transfer.blockTimestamp };
        }
    }

    public async create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer> {
        const [toAddress, toWallet] = await this.parseDestination(to);
        this._logger.verbose(`Mint offer type: ${offerType} to: ${toAddress} spent: ${amount} tokens`);
        const adminWallet = this._walletService.getAdminWallet();
        const adminToken = await this._contractService.tokenContract(adminWallet);
        const adminOffer = await this._contractService.offerContract(adminWallet);
        let txOffer;

        if (amount > 0) {
            const toBalance = await adminToken.balanceOf(toAddress);
            if (toBalance < amount) {
                throw new InsufficientBalanceError(`Offer requires ${amount} tokens when only ${toBalance} available`);
            }
            if (toWallet) { // if user is specified then auto-approve
                await this._walletService.gasWallet(toWallet);
                const toToken = await this._contractService.tokenContract(toWallet);
                const txApprove = await toToken.approve(adminWallet.address, amount);
                await txApprove.wait();
            } else if (await adminToken.allowance(toAddress, adminWallet.address) < amount) {
                throw new NotApprovedError(`Offer requires admin wallet: ${adminWallet.address} to be approved to transfer tokens`);
            }
            const partnerAddress = this._walletService.getLuckyBetWallet().address; // !! replace with partner wallet
            const txToken = await adminToken.transferFrom(toAddress, partnerAddress, amount);
            const txTokenReceipt = await txToken.wait();
            txOffer = await adminOffer.mint(toAddress, BigInt(offerType), txTokenReceipt.hash);
        } else {
            txOffer = await adminOffer.mint(toAddress, BigInt(offerType));
        }
        return this.lockTransfer(async () => {
            const txOfferReceipt: TransactionReceipt = await txOffer.wait();
            // !! need to check receipt status to check mined
            const tokenId = (txOfferReceipt.logs.find(l => l.topics[0] === TRANSFER_TOPIC) as EventLog)?.args[2];
            if (!tokenId) {
                throw new OfferTokenIdError("Failed to read token identifier from event");
            }
            return this.saveTransfer(ZeroAddress, toAddress, tokenId, txOfferReceipt.blockNumber, txOfferReceipt.hash, additionalInfo);
        });
    }

    public async transfer(from: ISource, to: IDestination, tokenId: bigint): Promise<RawTransfer> {
        const [toAddress,] = await this.parseDestination(to);
        this._logger.verbose(`Transfer offer: ${tokenId} from user: ${from.userId} to: ${toAddress}`);
        const wallet = await this._userService.getUserWallet(from.userId);
        const offer = await this._contractService.offerContract(wallet);
        let tx;

        await this._walletService.gasWallet(wallet);
        if (from.asAdmin) {
            const adminWallet = this._walletService.getAdminWallet();
            const txApprove = await offer.approve(adminWallet.address, tokenId);
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

    public async activate(userId: string, tokenId: bigint): Promise<RawTransfer> {
        const wallet = await this._userService.getUserWallet(userId);
        const offer = await this._contractService.offerContract(wallet);
        const tx = await offer.burn(tokenId);
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            return this.saveTransfer(wallet.address, ZeroAddress, tokenId, txReceipt.blockNumber, txReceipt.hash);
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

    // TODO: base implementation on which to build future support for partners creating offers; it is envisaged that
    // offer types will be allocated in blocks with each block having an owner which is then stored in the database
    public async isOwner(_offerType: number, _partner: string): Promise<boolean> {
        return false;
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
        const offer = Object.assign({ tokenId: `0x${tokenId.toString(16)}` }, additionalInfo && { additionalInfo });
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
