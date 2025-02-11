import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, Unique, UpdateDateColumn } from "typeorm";
import { OperationStatus } from "../common.types";

@Entity()
export class AirdropDestination {
	@Column()
	address: string

	@Column()
	userId?: string
}

@Entity("airdrops")
export class AirdropChunk {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index()
	requestId: string;

	@Column()
	status: OperationStatus;

	@Column()
	error?: string;

	@Column()
	amount: string;

	@Column(() => AirdropDestination, { array: true })
	destinations: AirdropDestination[];

	@Column()
	txHash?: string;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
