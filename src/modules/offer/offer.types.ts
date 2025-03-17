import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { DestinationDTO, IDestination, ISource, MimeType, TransferHistoryDTO } from "../../common.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { Metadata, Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";

export class CreateOfferCommand {
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => DestinationDTO)
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
    @ApiPropertyOptional({
        description: "Identifier of user to transfer offer from (admin only)",
        type: String,
    })
    fromUserId?: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => DestinationDTO)
    @ApiProperty({
        description: "Where to transfer offer to",
        type: () => DestinationDTO,
    })
    to: DestinationDTO;
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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttributeDTO)
    @ApiProperty({
        description: "Attributes for offer type",
        type: () => AttributeDTO,
        isArray: true
    })
    attributes: AttributeDTO[];
}

export class OfferDTO {
    @ApiProperty({
        description: "Token identifier of offer",
        type: String,
    })
    tokenId: string;

    @ApiProperty({
        description: "Name of offer type",
        type: String,
    })
    offerName?: string;
}

export class OfferHistoryDTO extends TransferHistoryDTO {
    @ApiProperty({
        description: "Token identifier of offer transferred",
        type: String,
    })
    tokenId: string;

    @ApiProperty({
        description: "Name of offer type",
        type: String,
    })
    offerName?: string;

    @ApiPropertyOptional({
        description: "Additional information related to transaction",
        type: String,
    })
    additionalInfo?: string;
}

export class AttributeDTO {
    @IsNotEmpty()
    @ApiProperty({
        description: "Name of attribute",
        type: String,
    })
    name: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "Value of attribute",
        type: Object,
    })
    value: string | number;

    @ApiProperty({
        description: "Attribute which can be allocated for any purpose (say type)",
        type: Object,
    })
    other?: string;
}

export class TemplateDTO {
    @ApiProperty({
        description: "Type of offer",
        type: String,
    })
    offerType: number;

    @ApiProperty({
        description: "Instance of offer (when overriding general case)",
        type: String,
    })
    offerInstance?: number;

    @ApiProperty({
        description: "Name of offer type",
        type: String,
    })
    name: string;

    @ApiProperty({
        description: "Description of offer type",
        type: String,
    })
    description: string;

    @ApiProperty({
        description: "Attributes for offer type",
        type: () => AttributeDTO,
        isArray: true
    })
    attributes: AttributeDTO[];
}

export class ImageDTO {
    @ApiProperty({
        description: "Data URL encoded image",
        type: String,
    })
    dataUrl?: string;
}

export type TransformedMetadata = Omit<Metadata, "attributes"> & {
    attributes: any[];
}

export type MetadataDetails = {
    usesDefault?: boolean;
    additionalInfo?: string;
}

export interface IOfferService {
    getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata>;
    getImage(offerType: number, offerInstance: number): Promise<OfferImage>;
    getOffers(dest: IDestination, shortId?: boolean): Promise<OfferDTO[]>;
    getHistory(dest: IDestination): Promise<OfferHistoryDTO[]>;
    create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer>;
    activate(userId: string, tokenId: bigint): Promise<RawTransfer>;
    transfer(from: ISource, to: IDestination, tokenId: bigint): Promise<RawTransfer>;
    getTemplates(): Promise<Template[]>;
    createTemplate(offerType: number, metadata: Metadata, offerInstance?: number): Promise<void>;
    deleteTemplate(offerType: number, offerInstance?: number): Promise<void>;
    uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void>;
    deleteImage(offerType: number, offerInstance?: number): Promise<void>;
    isOwner(offerType: number, partner: string): Promise<boolean>
}
