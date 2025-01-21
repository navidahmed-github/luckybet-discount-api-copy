import { ApiProperty } from "@nestjs/swagger";
import { Wallet } from "ethers";

export class UserDTO {
	@ApiProperty({
		description: "Unique identifier for the user",
		type: String,
	})
	id: string;

    @ApiProperty({
		type: String,
		description: "The user's ethereum address",
		example: "0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd",
	})
	address: string;
}

export interface IUserService {
	findAll(): Promise<UserDTO[]>;
	getById(id: string): Promise<UserDTO>;
	create(id: string, options?: { waitOnTransaction: boolean }): Promise<UserDTO>;
	getUserWallet(id: string): Promise<Wallet>;
}
