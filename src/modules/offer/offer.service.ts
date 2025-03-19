import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, EventLog, id, TransactionReceipt, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { callContract, formatTokenId, fromTokenNative, getTokenId, IDestination, ISource, MimeType, parseDestination, splitTokenId, toAdminString, toNumberSafe } from "../../common.types";
import { InsufficientBalanceError, NotApprovedError, OfferTokenIdError } from "../../error.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IOfferService, MetadataDetails, OfferDTO, OfferHistoryDTO, OfferSummaryDTO, TransformedMetadata } from "./offer.types";
import { TransferService } from "../../services/transfer.service";

export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

export enum OfferServiceSettingKeys {
    ATTRIBUTE_NAME_MAPPING = "ATTRIBUTE_NAME_MAPPING",
    ATTRIBUTE_OTHER_MAPPING = "ATTRIBUTE_OTHER_MAPPING"
}

@Injectable()
export class OfferService extends TransferService<OfferHistoryDTO> implements IOfferService {
    constructor(
        private readonly config: ConfigService,

        @Inject(ProviderTokens.WalletService)
        private readonly _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,

        @InjectRepository(Template)
        private readonly _templateRepository: MongoRepository<Template>,

        @InjectRepository(OfferImage)
        private readonly _imageRepository: MongoRepository<OfferImage>,
    ) {
        super(new Logger(OfferService.name), ethereumProviderService, userRepository);
    }

    public async getSummary(): Promise<OfferSummaryDTO> {
        const offer = await this._contractService.offerContract();
        const transferSummary = await super.getSummary("offer");
        const totalSupply = toNumberSafe(await offer.totalSupply());
        const totalOfferTypes = toNumberSafe(await offer.totalTypes());
        const topMintedTypes = await this._transferRepository.aggregate([
            { $match: { offer: { $exists: true } } },
            {
                $group: {
                    _id: "$offer.offerType",
                    totalMints: { $sum: { $cond: { if: { $eq: ["$fromAddress", ZeroAddress] }, then: 1, else: 0 } } },
                    totalBurns: { $sum: { $cond: { if: { $eq: ["$toAddress", ZeroAddress] }, then: 1, else: 0 } } }
                }
            },
            { $sort: { totalMints: -1 } },
            { $limit: 3 }
        ]).toArray() as any;
        const topOfferTypes = await Promise.all(topMintedTypes.map(async t => {
            const template = await this._templateRepository.findOne({ where: { offerType: t._id, offerInstance: undefined } });
            return {
                offerType: t._id,
                totalMints: t.totalMints,
                totalBurns: t.totalBurns,
                ...(template?.metadata?.name && { offerName: template.metadata.name })
            };
        }));
        return { ...transferSummary, totalSupply, totalOfferTypes, topOfferTypes };
    }

    public async getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<TransformedMetadata & MetadataDetails> {
        const [template, overriden] = await this.getWithFallback(this._templateRepository, offerType, offerInstance);
        if (!template?.metadata) {
            return undefined;
        }
        const nameMapping = this.config.get(OfferServiceSettingKeys.ATTRIBUTE_NAME_MAPPING) ?? "name";
        const otherMapping = this.config.get(OfferServiceSettingKeys.ATTRIBUTE_OTHER_MAPPING) ?? "other";
        const metadata = {
            ...template.metadata, attributes: template.metadata.attributes.map(a => ({
                value: a.value,
                [nameMapping]: a.name,
                ...(a.other && { [otherMapping]: a.other })
            }))
        };
        if (!detailed) {
            return metadata;
        }
        const mint = await this._transferRepository.findOne({
            where: {
                fromAddress: ZeroAddress,
                'offer.offerType': offerType,
                'offer.offerInstance': offerInstance
            }
        });
        const amount = mint?.offer?.amount;
        const additionalInfo = mint?.offer?.additionalInfo;
        return {
            ...metadata,
            usesDefault: !overriden,
            ...(amount && { amount: fromTokenNative(BigInt(amount)) }),
            ...(additionalInfo && { additionalInfo })
        };
    }

    public async getImage(offerType: number, offerInstance: number): Promise<OfferImage> {
        return (await this.getWithFallback(this._imageRepository, offerType, offerInstance))[0];
    }

    public async getOffers(dest: IDestination, shortId?: boolean): Promise<OfferDTO[]> {
        const [address] = await parseDestination(this._userService, dest);
        this._logger.verbose(`Retrieving offers for address: ${address}`);
        const offer = await this._contractService.offerContract();
        const balance = await offer.balanceOf(address);
        const offers = [];

        for (let i = 0; i < balance; i++) {
            const tokenId = await offer.tokenOfOwnerByIndex(address, i);
            const { offerType, offerInstance } = splitTokenId(tokenId);
            const [template] = await this.getWithFallback(this._templateRepository, offerType, offerInstance);
            offers.push({ tokenId: formatTokenId(tokenId, shortId), ...(template?.metadata?.name && { offerName: template.metadata.name }) });
        }
        offers.sort((a, b) => a.tokenId.localeCompare(b.tokenId, "en-AU", { numeric: true }))
        return offers;
    }

    public async getHistory(dest: IDestination): Promise<OfferHistoryDTO[]> {
        return super.getHistory(dest, "offer", async t => {
            const [template] = await this.getWithFallback(this._templateRepository, t.offer.offerType, t.offer.offerInstance);
            const tokenId = formatTokenId(getTokenId(t.offer.offerType, t.offer.offerInstance));
            const amount = t.offer.amount ? { amount: fromTokenNative(BigInt(t.offer.amount)) } : {};
            const additionalInfo = t.offer.additionalInfo ? { additionalInfo: t.offer.additionalInfo } : {};
            return { tokenId, ...amount, ...additionalInfo, ...(template?.metadata?.name && { offerName: template.metadata.name }) };
        });
    }

    public async create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer> {
        const [toAddress, toWallet] = await parseDestination(this._userService, to);
        this._logger.verbose(`Mint offer type: ${offerType}, to: ${toAddress}, spent: ${amount} tokens`);
        const adminWallet = this._walletService.getAdminWallet();
        const adminToken = await this._contractService.tokenContract(adminWallet);
        const adminOffer = await this._contractService.offerContract(adminWallet);
        let txOffer;

        await this._walletService.gasWallet(adminWallet);
        if (amount > 0) {
            const toBalance = await adminToken.balanceOf(toAddress);
            if (toBalance < amount) {
                throw new InsufficientBalanceError(`Offer requires ${amount} tokens when only ${toBalance} available`);
            }
            if (toWallet) { // if user is specified then auto-approve
                await this._walletService.gasWallet(toWallet);
                const toToken = await this._contractService.tokenContract(toWallet);
                const txApprove = await callContract(() => toToken.approve(adminWallet.address, amount), toToken);
                await txApprove.wait();
            } else if (await adminToken.allowance(toAddress, adminWallet.address) < amount) {
                throw new NotApprovedError(`Offer requires admin wallet: ${adminWallet.address} to be approved to transfer tokens`);
            }
            const partnerAddress = this._walletService.getLuckyBetWallet().address; // TODO: replace with partner wallet
            const txToken = await callContract(() => adminToken.transferFrom(toAddress, partnerAddress, amount), adminToken);
            const txTokenReceipt = await txToken.wait();
            txOffer = await callContract(() => adminOffer["mint(address,uint128,(bytes32))"](
                toAddress,
                BigInt(offerType),
                [txTokenReceipt.hash.valueOf()]
            ), adminOffer);
        } else {
            txOffer = await callContract(() => adminOffer.mint(toAddress, BigInt(offerType)), adminOffer);
        }
        return this.lockTransfer(async () => {
            const txOfferReceipt: TransactionReceipt = await txOffer.wait();
            const tokenId: bigint = (txOfferReceipt.logs.find(l => l.topics[0] === TRANSFER_TOPIC) as EventLog)?.args[2];
            if (!tokenId) {
                throw new OfferTokenIdError("Failed to read token identifier from event");
            }
            this._logger.verbose(`Minted offer: ${formatTokenId(tokenId)}`);
            const rawTransfer = await this.saveTransfer(
                ZeroAddress, toAddress, tokenId, txOfferReceipt.blockNumber, txOfferReceipt.hash, amount.toString(), additionalInfo);
            return this.addTokenId(rawTransfer, tokenId);
        });
    }

    public async activate(userId: string, tokenId: bigint): Promise<RawTransfer> {
        this._logger.verbose(`Activate offer: ${formatTokenId(tokenId)} for user: ${userId}`);
        const wallet = await this._userService.getUserWallet(userId);
        const offer = await this._contractService.offerContract(wallet);

        const owner = await offer.ownerOf(tokenId);
        if (owner !== wallet.address) {
            throw new InsufficientBalanceError(`User ${userId} is not the owner of offer: ${formatTokenId(tokenId)}`);
        }

        await this._walletService.gasWallet(wallet);
        const tx = await callContract(() => offer.burn(tokenId), offer);
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            const rawTransfer = await this.saveTransfer(wallet.address, ZeroAddress, tokenId, txReceipt.blockNumber, txReceipt.hash);
            return this.addTokenId(rawTransfer, tokenId);
        });
    }

    public async transfer(from: ISource, to: IDestination, tokenId: bigint): Promise<RawTransfer> {
        const [toAddress] = await parseDestination(this._userService, to);
        this._logger.verbose(`Transfer offer: ${formatTokenId(tokenId)} from user: ${from.userId}, to: ${toAddress} ${toAdminString(from)}`);
        const wallet = await this._userService.getUserWallet(from.userId);
        const offer = await this._contractService.offerContract(wallet);
        let tx;

        const owner = await offer.ownerOf(tokenId);
        if (owner !== wallet.address) {
            throw new InsufficientBalanceError(`User ${from.userId} is not the owner of offer: ${formatTokenId(tokenId)}`);
        }

        await this._walletService.gasWallet(wallet);
        if (from.asAdmin) {
            const adminWallet = this._walletService.getAdminWallet();
            await this._walletService.gasWallet(adminWallet);
            const txApprove = await callContract(() => offer.approve(adminWallet.address, tokenId), offer);
            await txApprove.wait();
            const adminOffer = await this._contractService.offerContract(adminWallet);
            tx = await callContract(() => adminOffer.transferFrom(wallet.address, toAddress, tokenId), adminOffer);
        } else {
            tx = await callContract(() => offer.transferFrom(wallet.address, toAddress, tokenId), offer);
        }
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            const rawTransfer = await this.saveTransfer(wallet.address, toAddress, tokenId, txReceipt.blockNumber, txReceipt.hash);
            return this.addTokenId(rawTransfer, tokenId);
        });
    }

    public async getTemplates(): Promise<Template[]> {
        this._logger.verbose("Get templates");
        return this._templateRepository.find({ order: { offerType: "ASC", offerInstance: "ASC" } });
    }

    public async getNextOfferType(_partner: string): Promise<number> {
        const result = await this._templateRepository.aggregate([
            { $group: { _id: null, maxOfferType: { $max: "$offerType" } } }
        ]).next() as any;
        return (result?.maxOfferType ?? 0) + 1;
    }

    public async createTemplate(offerType: number, metadata: Metadata, offerInstance?: number): Promise<void> {
        if (offerInstance === 0)
            offerInstance = undefined;
        this._logger.verbose(`Create template for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const id = (await this._templateRepository.findOne({ where: { offerType, offerInstance } }))?.id;
        const record = { offerType, metadata, ...(offerInstance && { offerInstance }) };
        // when performing an update via save, TypeORM tries to work out the difference but doesn't handle empty arrays or
        // missing fields properly so just force it instead 
        if (id) {
            await this._templateRepository.update(id, record);
        } else {
            await this._templateRepository.save(record);
        }
    }

    public async deleteTemplate(offerType: number, offerInstance?: number): Promise<void> {
        if (offerInstance === 0)
            offerInstance = undefined;
        this._logger.verbose(`Delete template for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const existing = await this._templateRepository.findOne({ where: { offerType, offerInstance } });
        if (existing) {
            await this._templateRepository.delete(existing.id);
        }
    }

    public async uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void> {
        if (offerInstance === 0)
            offerInstance = undefined;
        this._logger.verbose(`Upload ${format} for type: ${offerType}` + (offerInstance ? ` overriding instance: ${offerInstance}` : ""));
        const id = (await this._imageRepository.findOne({ where: { offerType, offerInstance } }))?.id;
        const record = { offerType, format, data, ...(offerInstance && { offerInstance }) };
        if (id) {
            await this._imageRepository.update(id, record);
        } else {
            await this._imageRepository.save(record);
        }
    }

    public async deleteImage(offerType: number, offerInstance?: number): Promise<void> {
        if (offerInstance === 0)
            offerInstance = undefined;
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

    protected async getContract(): Promise<Contract> {
        return this._contractService.offerContract();
    }

    protected addTransferData(transfer: Omit<RawTransfer, "token" | "offer">, value: bigint, args: any[]): RawTransfer {
        const offerId = splitTokenId(value);
        const offer = Object.assign(offerId, args[0] && { amount: args[0] }, args[1] && { additionalInfo: args[1] });
        return { ...transfer, offer };
    }

    private async getWithFallback<T>(repository: MongoRepository<T>, offerType: number, offerInstance: number): Promise<[T, boolean]> {
        const overriden = await repository.findOne({ where: { offerType, offerInstance } });
        return overriden ? [overriden, true] : [await repository.findOne({ where: { offerType, offerInstance: undefined } }), false];
    }

    private addTokenId(transfer: RawTransfer, tokenId: bigint): RawTransfer & { offer: { tokenId: string } } {
        return { ...transfer, offer: { ...transfer.offer, tokenId: formatTokenId(tokenId, true) } };
    }
}
