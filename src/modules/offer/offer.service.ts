import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { Contract, EventLog, id, TransactionReceipt, ZeroAddress } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { IDestination, ISource, MimeType, toAdminString } from "../../common.types";
import { InsufficientBalanceError, NotApprovedError, OfferTokenIdError } from "../../error.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IOfferService, OfferHistoryDTO } from "./offer.types";
import { TransferService } from "../../services/transfer.service";

export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

@Injectable()
export class OfferService extends TransferService<OfferHistoryDTO> implements IOfferService {
    constructor(
        @Inject(ProviderTokens.WalletService)
        private _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(User)
        userRepository: MongoRepository<User>,

        @InjectRepository(Template)
        private _templateRepository: MongoRepository<Template>,

        @InjectRepository(OfferImage)
        private _imageRepository: MongoRepository<OfferImage>,
    ) {
        super(new Logger(OfferService.name), ethereumProviderService, userRepository);
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
        return super.getHistory(dest, "offer", t => t.offer);
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
        this._logger.verbose(`Transfer offer: ${tokenId} from user: ${from.userId} to: ${toAddress} ${toAdminString(from)}`);
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

    protected async getContract(): Promise<Contract> {
        return this._contractService.offerContract();
    }

    protected addTransferData(transfer: Omit<RawTransfer, "token" | "offer">, value: bigint, args: any[]): RawTransfer {
        const offer = Object.assign({ tokenId: `0x${value.toString(16)}` }, args[0] && { additionalInfo: args[0] });
        return { ...transfer, offer };
    }

    private async getWithFallback<T>(repository: MongoRepository<T>, offerType: number, offerInstance: number): Promise<[T, boolean]> {
        const overriden = await repository.findOne({ where: { offerType, offerInstance } });
        return overriden ? [overriden, true] : [await repository.findOne({ where: { offerType, offerInstance: undefined } }), false];
    }
}
