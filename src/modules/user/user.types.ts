import { ApiProperty } from "@nestjs/swagger";
import { Wallet } from "ethers";

export class UserDTO {
	@ApiProperty({
		description: "Unique identifier for the user",
		type: String,
	})
	id: string;

    @ApiProperty({
		description: "The user's ethereum address",
		example: "0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd",
		type: String,
	})
	address: string;
}

export class CreateUserCommand {
	@ApiProperty({
		description: "Unique identifier for the user",
		type: String,
	})
	id: string;
}

export interface IUserService {
	getAll(): Promise<UserDTO[]>;
	getById(userId: string): Promise<UserDTO>;
	getUserWallet(userId: string): Promise<Wallet>;
	create(userId: string): Promise<UserDTO>;
}
