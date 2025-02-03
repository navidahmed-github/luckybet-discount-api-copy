import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { TransferType } from "../../common.types";
import { RawTransfer } from "../../entities/transfer.entity";

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
        type: String,
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
    getOffers(userId: string): Promise<string[]>;
    getHistory(userId: string): Promise<OfferHistoryDTO[]>;
    create(toAddress: string, offerType: number, amount: bigint, additionalInfo?: string): Promise<RawTransfer>;
    transfer(userId: string, toAddress: string, tokenId: bigint, asAdmin: boolean): Promise<RawTransfer>;
}
