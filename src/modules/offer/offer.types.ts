import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { DestinationDTO, IDestination, ISource, MimeType, TransferHistoryDTO, TransferSummaryDTO } from "../../common.types";
import { RawTransferWithTokenId } from "../../entities/transfer.entity";
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

export class OfferTypeDTO {
    @ApiProperty({
        description: "Type of offer",
        type: String,
    })
    offerType: string;

    @ApiProperty({
        description: "Name of offer type",
        type: String,
    })
    offerName?: string;

    @ApiProperty({
        description: "Total count of all mints that have occurred for this type",
        type: Number,
    })
    totalMints: number;

    @ApiProperty({
        description: "Total count of all burns that have occurred for this type",
        type: Number,
    })
    totalBurns: number;
}

export class NextOfferDTO {
    @ApiProperty({
        description: "Next unused offer type",
        type: String,
    })
    nextOfferType: number;
}

export class OfferSummaryDTO extends TransferSummaryDTO {
    @ApiProperty({
        description: "Current total supply of offers",
        type: Number,
    })
    totalSupply: number;

    @ApiProperty({
        description: "Number of unique offer types minted",
        type: Number,
    })
    totalOfferTypes: number;

    @ApiProperty({
        description: "Most minted offer types",
        type: () => OfferTypeDTO,
        isArray: true
    })
    topOfferTypes: OfferTypeDTO[];
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
        description: "Amount of discount tokens spent on offer",
        type: Number,
    })
    amount?: number;

    @ApiPropertyOptional({
        description: "Additional information related to transaction",
        type: String,
    })
    additionalInfo?: string;
}

export class OfferTransferDTO {
    @ApiProperty({
        description: "Address from which offer transferred",
        type: String,
    })
    fromAddress: string;

    @ApiProperty({
        description: "Address to which offer transferred",
        type: String,
    })
    toAddress: string;

    @ApiProperty({
        description: "Block number associated with transfer",
        type: String,
    })
    blockNumber: number;

    @ApiProperty({
        description: "Transaction hash associated with transfer",
        type: String,
    })
    txHash: string;

    @ApiProperty({
        description: "Token identifier of offer",
        type: String,
    })
    tokenId: string;

    @ApiPropertyOptional({
        description: "Amount of discount tokens spent on offer",
        type: Number,
    })
    amount?: number;

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
    getSummary(): Promise<OfferSummaryDTO>;
    getMetadata(offerType: number, offerInstance: number, detailed?: boolean): Promise<Metadata>;
    getImage(offerType: number, offerInstance: number): Promise<OfferImage>;
    getOffers(dest: IDestination, shortId?: boolean): Promise<OfferDTO[]>;
    getHistory(dest: IDestination): Promise<OfferHistoryDTO[]>;
    create(to: IDestination, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransferWithTokenId>;
    activate(userId: string, tokenId: bigint): Promise<RawTransferWithTokenId>;
    transfer(from: ISource, to: IDestination, tokenId: bigint): Promise<RawTransferWithTokenId>;
    getTemplates(): Promise<Template[]>;
    getNextOfferType(partner: string): Promise<number>;
    createTemplate(offerType: number, metadata: Metadata, offerInstance?: number): Promise<void>;
    deleteTemplate(offerType: number, offerInstance?: number): Promise<void>;
    uploadImage(offerType: number, format: MimeType, data: Buffer, offerInstance?: number): Promise<void>;
    deleteImage(offerType: number, offerInstance?: number): Promise<void>;
    isOwner(offerType: number, partner: string): Promise<boolean>
}
