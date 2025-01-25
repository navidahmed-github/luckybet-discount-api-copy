import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";
import { UserDTO } from "../modules/user/user.types";

@Entity("users")
export class User {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index({ unique: true })
	userId: string;

	@Column()
	@Index()
	address: string;

	@Column()
	@Index({ unique: true })
	ordinal: number;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;

	public static toDTO(user: User): UserDTO {
		return { id: user.userId, address: user.address };
	}
}
