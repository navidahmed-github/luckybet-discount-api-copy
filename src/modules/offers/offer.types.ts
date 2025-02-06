import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { MimeType, TransferType } from "../../common.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { Metadata } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";

export class CreateOfferCommand {
    @ApiProperty({
        description: "Identifier of user to transfer NFT to",
        type: String,
    })
    toUserId?: string;

    @ApiProperty({
        description: "Address of wallet to transfer NFT to",
        type: String,
    })
    toAddress?: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Offer type to generate",
        type: Number,
    })
    offerType: number;

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
        description: "Identifier of user to transfer token from",
        type: String,
    })
    fromUserId?: string;

    @ApiProperty({
        description: "Identifier of user to transfer token to",
        type: String,
    })
    toUserId?: string;

    @ApiProperty({
        description: "Address of wallet to transfer token to",
        type: String,
    })
    toAddress?: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Offer to transfer",
        type: String,
    })
    tokenId: string;
}

export class OfferHistoryDTO {
    @IsNotEmpty()
    @ApiProperty({
        description: "The type of transfer",
        enum: TransferType,
    })
    type: TransferType;

    @ApiProperty({
        description: "Address of wallet that token was transferred to/from",
        type: String,
    })
    otherAddress?: string;

    @ApiProperty({
        description: "Identifier of user that token was transferred to/from",
        type: String,
    })
    otherUser?: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Offer transferred",
        type: String,
    })
    tokenId: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "The timestamp when the transfer occurred",
        type: Number,
    })
    time: number;
}

export interface IOfferService {
    getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata>;
    getImage(offerType: number, offerInstance: number): Promise<OfferImage>;
    getOffers(userId: string): Promise<string[]>;
    getHistory(userId: string): Promise<OfferHistoryDTO[]>;
    create(toAddress: string, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer>;
    transfer(userId: string, toAddress: string, tokenId: bigint, asAdmin: boolean): Promise<RawTransfer>;
    createTemplate(offerType: number, metdata: Metadata, offerInstance?: number): Promise<void>;
    deleteTemplate(offerType: number, offerInstance?: number): Promise<void>;
    uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void>;
    deleteImage(offerType: number, offerInstance?: number): Promise<void>;
}
