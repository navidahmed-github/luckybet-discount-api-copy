import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";

export class TransferTokenCommand {
	@IsNotEmpty()
    @ApiProperty({
        description: "Address of wallet to transfer token to",
        type: String,
    })
    to: string;

	@IsNotEmpty()
    @ApiProperty({
        type: String,
        description: "The amount of the token to transfer",
    })
    amount: string;
}

export interface ITokenService {
    getBalance(userId: string): Promise<bigint>;
    transfer(userId: string, to: string, amount: bigint): Promise<void>;
    mint(to: string, amount: bigint): Promise<void>;
}
