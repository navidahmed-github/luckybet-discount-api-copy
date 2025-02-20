import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { DestinationDTO, IDestination, ISource, MimeType, TransferHistoryDTO } from "../../common.types";
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
        type: Number,
    })
    amount: number;

    @ApiPropertyOptional({
        description: "Additional information to store related to transaction",
        type: String,
    })
    additionalInfo?: string;
}

export class TransferOfferCommand {
    @IsNotEmpty()
    @ApiPropertyOptional({
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
        description: "Token identifier of offer to transfer",
        type: String,
    })
    tokenId: string;
}

export class ActivateOfferCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Token identifier of offer to activate",
        type: String,
    })
    tokenId: string;
}

export class CreateTemplateCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Name of offer type",
        type: String,
    })
    name: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Description of offer type",
        type: String,
    })
    description: string;

    @ApiProperty({
        description: "Attributes for offer type",
        type: Object,
    })
    attributes: object;
}

export class OfferHistoryDTO extends TransferHistoryDTO {
    @ApiProperty({
        description: "Token identifier of offer transferred",
        type: String,
    })
    tokenId: string;

    @ApiPropertyOptional({
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
