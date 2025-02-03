import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity()
export class TokenTransfer {
	@Column()
	amount: string; // can't store bigint in MongoDB natively
}

@Entity()
export class OfferTransfer {
	@Column()
	tokenId: string;

	@Column()
	additionalInfo?: string;
}

@Entity("transfers")
export class Transfer {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index()
	fromAddress: string;

	@Column()
	@Index()
	toAddress: string;

	@Column()
	blockNumber: number;

	@Column()
	@Index()
	blockTimestamp: number;

	@Column()
	@Index({ unique: true })
	txHash: string;

	@Column(() => TokenTransfer)
	token?: TokenTransfer;

	@Column(() => OfferTransfer)
	offer?: OfferTransfer;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}

export type RawTransfer = Omit<Transfer, "id" | "blockTimestamp" | "createdAt" | "updatedAt">;
