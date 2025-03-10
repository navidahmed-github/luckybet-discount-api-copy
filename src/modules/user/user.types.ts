import { ApiProperty } from "@nestjs/swagger";
import { Wallet } from "ethers";
import { User } from "../../entities/user.entity";

export class UserDTO {
	@ApiProperty({
		description: "Unique identifier for the user",
		type: String,
	})
	id: string;

    @ApiProperty({
		description: "Wallet address of user",
		example: "0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd",
		type: String,
	})
	address: string;

	@ApiProperty({
		description: "Ordinal used to derive wallet address",
		type: Number,
	})
	ordinal: number;
}

export class CreateUserCommand {
	@ApiProperty({
		description: "Unique identifier for the user to create",
		type: String,
	})
	id: string;
}

export interface IUserService {
	getAll(): Promise<User[]>;
	getByUserId(userId: string): Promise<User>;
	getUserWallet(userId: string): Promise<Wallet>;
	create(userId: string): Promise<User>;
}
