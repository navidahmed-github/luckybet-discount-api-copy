import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

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
}
