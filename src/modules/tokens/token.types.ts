import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { TransferType } from "../../common.types";
import { RawTransfer, Transfer } from "../../entities/transfer.entity";

export class CreateTokenCommand {
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
        description: "The amount of the token to transfer",
        type: String,
    })
    amount: string;
}

export class DestroyTokenCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "The amount of the token to burn",
        type: String,
    })
    amount: string;
}

export class TransferTokenCommand extends CreateTokenCommand {
    @ApiProperty({
        description: "Identifier of user to transfer token from",
        type: String,
    })
    fromUserId?: string;
}

export class TokenBalanceDTO {
    @ApiProperty({
        description: "Balance for user",
        type: String
    })
    balance: string;
}

export class TokenHistoryDTO {
    @ApiProperty({
        description: "Type of transfer",
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

    @ApiProperty({
        description: "Amount of tokens transferred",
        type: String,
    })
    amount: string;

    @ApiProperty({
        description: "Timestamp when the transfer occurred",
        type: Number,
    })
    timestamp: number;
}

export class TokenTransferDTO {
    @ApiProperty({
        description: "Address from which tokens transferred",
        type: String,
    })
    fromAddress: string;

    @ApiProperty({
        description: "Address to which tokens transferred",
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
        description: "The amount of tokens transferred",
        type: String,
    })
    amount: string;
}

export interface ITokenService {
    getBalance(userId: string): Promise<bigint>;
    getHistory(userId: string): Promise<TokenHistoryDTO[]>;
    create(toAddress: string, amount: bigint): Promise<RawTransfer>;
    destroy(amount: bigint): Promise<void>;
    transfer(userId: string, toAddress: string, amount: bigint, asAdmin: boolean): Promise<RawTransfer>;
}
