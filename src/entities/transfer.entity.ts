import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity()
export class TokenTransfer {
	@Column()
	amount: bigint;
}

@Entity()
export class OfferTransfer {
	@Column()
	tokenId: string;
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
	token: TokenTransfer;

	@Column(() => OfferTransfer)
	offer: OfferTransfer;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
