import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { DestinationDTO, HistoryDTO, IDestination, ISource, MimeType } from "../../common.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { Metadata } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";

export class CreateOfferCommand {
    @ApiProperty({
        description: "Where to transfer NFT to",
        type: () => DestinationDTO,
    })
    to: DestinationDTO;

    @IsNotEmpty()
    @ApiProperty({
        description: "Amount of discount tokens to spend on offer",
        type: String,
    })
    amount: string;

    @ApiProperty({
        description: "Additional information to store related to transaction",
        type: String,
    })
    additionalInfo?: string;
}

export class CreateTemplateCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Name of offer",
        type: String,
    })
    name: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Description of offer",
        type: String,
    })
    description: string;

    attributes: object;
}

export class TransferOfferCommand {
    @ApiProperty({
        description: "Identifier of user to transfer offer from (admin only)",
        type: String,
    })
    fromUserId?: string;

    @ApiProperty({
        description: "Where to transfer offer to",
        type: () => DestinationDTO,
    })
    to: DestinationDTO;
    
    @IsNotEmpty()
    @ApiProperty({
        description: "Offer to transfer",
        type: String,
    })
    tokenId: string;
}

export class ActivateOfferCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Offer to activate",
        type: String,
    })
    tokenId: string;
}

export class OfferHistoryDTO extends HistoryDTO {
    @IsNotEmpty()
    @ApiProperty({
        description: "Offer transferred",
        type: String,
    })
    tokenId: string;

    @ApiProperty({
        description: "Additional information related to transaction",
        type: String,
    })
    additionalInfo?: string;
}

export interface IOfferService {
    getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata>;
    getImage(offerType: number, offerInstance: number): Promise<OfferImage>;
    getOffers(dest: IDestination): Promise<bigint[]>;
    getHistory(dest: IDestination): Promise<OfferHistoryDTO[]>;
    create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer>;
    activate(userId: string, tokenId: bigint): Promise<RawTransfer>;
    transfer(from: ISource, to: IDestination, tokenId: bigint): Promise<RawTransfer>;
    createTemplate(offerType: number, metadata: Metadata, offerInstance?: number): Promise<void>;
    deleteTemplate(offerType: number, offerInstance?: number): Promise<void>;
    uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void>;
    deleteImage(offerType: number, offerInstance?: number): Promise<void>;
    isOwner(offerType: number, partner: string): Promise<boolean>
}
