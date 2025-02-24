import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, EventLog, id, TransactionReceipt, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { formatTokenId, getTokenId, IDestination, ISource, MimeType, parseDestination, splitTokenId, toAdminString } from "../../common.types";
import { InsufficientBalanceError, NotApprovedError, OfferTokenIdError } from "../../error.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IOfferService, MetadataDetails, OfferHistoryDTO } from "./offer.types";
import { TransferService } from "../../services/transfer.service";

export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

@Injectable()
export class OfferService extends TransferService<OfferHistoryDTO> implements IOfferService {
    constructor(
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

    public async getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata & MetadataDetails> {
        const [template, overriden] = await this.getWithFallback(this._templateRepository, offerType, offerInstance);
        if (!template?.metadata) {
            return undefined
        } else if (!detailed) {
            return template.metadata;
        }
        const mint = await this._transferRepository.findOne({
            where: {
                fromAddress: ZeroAddress,
                'offer.offerType': offerType,
                'offer.offerInstance': offerInstance
            }
        });
        const additionalInfo = mint?.offer?.additionalInfo;
        return { ...template.metadata, usesDefault: !overriden, ...(additionalInfo && { additionalInfo }) };
    }

    public async getImage(offerType: number, offerInstance: number): Promise<OfferImage> {
        return (await this.getWithFallback(this._imageRepository, offerType, offerInstance))[0];
    }

    public async getOffers(dest: IDestination): Promise<bigint[]> {
        const [address] = await parseDestination(this._userService, dest);
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
        return super.getHistory(dest, "offer", t => {
            const tokenId = formatTokenId(getTokenId(t.offer.offerType, t.offer.offerInstance));
            const additionalInfo = t.offer.additionalInfo ? { additionalInfo: t.offer.additionalInfo } : {};
            return { tokenId, ...additionalInfo };
        });
    }

    public async create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer> {
        const [toAddress, toWallet] = await parseDestination(this._userService, to);
        this._logger.verbose(`Mint offer type: ${offerType}, to: ${toAddress}, spent: ${amount} tokens`);
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
            txOffer = await adminOffer["mint(address,uint128,(bytes32))"](toAddress, BigInt(offerType), [txTokenReceipt.hash.valueOf()]);
        } else {
            txOffer = await adminOffer.mint(toAddress, BigInt(offerType));
        }
        return this.lockTransfer(async () => {
            const txOfferReceipt: TransactionReceipt = await txOffer.wait();
            // !! need to check receipt status to check mined
            const tokenId: bigint = (txOfferReceipt.logs.find(l => l.topics[0] === TRANSFER_TOPIC) as EventLog)?.args[2];
            if (!tokenId) {
                throw new OfferTokenIdError("Failed to read token identifier from event");
            }
            this._logger.verbose(`Minted offer: ${formatTokenId(tokenId)}`);
            const rawTransfer = await this.saveTransfer(ZeroAddress, toAddress, tokenId, txOfferReceipt.blockNumber, txOfferReceipt.hash, additionalInfo);
            return this.addTokenId(rawTransfer, tokenId);
        });
    }

    public async activate(userId: string, tokenId: bigint): Promise<RawTransfer> {
        const wallet = await this._userService.getUserWallet(userId);
        const offer = await this._contractService.offerContract(wallet);

        const owner = await offer.ownerOf(tokenId);
        if (owner !== wallet.address) {
            throw new InsufficientBalanceError(`User ${userId} is not the owner of offer: ${formatTokenId(tokenId)}`);
        }

        await this._walletService.gasWallet(wallet);
        const tx = await offer.burn(tokenId);
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
            const txApprove = await offer.approve(adminWallet.address, tokenId);
            await txApprove.wait();
            const adminOffer = await this._contractService.offerContract(adminWallet);
            tx = await adminOffer.transferFrom(wallet.address, toAddress, tokenId);
        } else {
            tx = await offer.transferFrom(wallet.address, toAddress, tokenId);
        }
        return this.lockTransfer(async () => {
            const txReceipt = await tx.wait();
            const rawTransfer = await this.saveTransfer(wallet.address, toAddress, tokenId, txReceipt.blockNumber, txReceipt.hash);
            return this.addTokenId(rawTransfer, tokenId);
        });
    }

    public async getTemplates(): Promise<Template[]> {
        this._logger.verbose("Get templates");
        return this._templateRepository.find();
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

    protected async getContract(): Promise<Contract> {
        return this._contractService.offerContract();
    }

    protected addTransferData(transfer: Omit<RawTransfer, "token" | "offer">, value: bigint, args: any[]): RawTransfer {
        const offerId = splitTokenId(value);
        const offer = Object.assign(offerId, args[0] && { additionalInfo: args[0] });
        return { ...transfer, offer };
    }

    private async getWithFallback<T>(repository: MongoRepository<T>, offerType: number, offerInstance: number): Promise<[T, boolean]> {
        const overriden = await repository.findOne({ where: { offerType, offerInstance } });
        return overriden ? [overriden, true] : [await repository.findOne({ where: { offerType, offerInstance: undefined } }), false];
    }

    private addTokenId(transfer: RawTransfer, tokenId: bigint): RawTransfer & { offer: { tokenId: string } } {
        return { ...transfer, offer: { ...transfer.offer, tokenId: formatTokenId(tokenId) } };
    }
}
