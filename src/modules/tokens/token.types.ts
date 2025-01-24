import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";

export class TransferTokenCommand {
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

export class HistoryDTO {
    @ApiProperty({
        description: "Address of wallet token was transferred from - empty for a mint",
        type: String,
    })
    from?: string;

    @ApiProperty({
        description: "Address of wallet token was transferred to - empty for a burn",
        type: String,
    })
    to?: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "The amount of tokens transferred",
        type: String,
    })
    amount: string;

    @IsNotEmpty()
    @ApiProperty({
        description: "The timestamp when the transfer occurred",
        type: Number,
    })
    time: number;
}

export interface ITokenService {
    getBalance(userId: string): Promise<bigint>;
    getHistory(userId: string): Promise<HistoryDTO[]>;
    transfer(userId: string, toAddress: string, amount: bigint): Promise<void>;
    mint(toAddress: string, amount: bigint): Promise<void>;
}
