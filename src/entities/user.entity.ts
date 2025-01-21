import { Column, CreateDateColumn, Entity, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

@Entity("users")
export class User {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	userId: string;

	@Column()
	address: string;

	@Column()
	ordinal: number;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
