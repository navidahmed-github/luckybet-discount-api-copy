import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class DepositStake {
	@Column()
	unlockTime: number;
}

@Entity()
export class WithdrawStake {
	@Column()
	rewardAmount: string;
}

@Entity("stakes")
export class Stake {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index()
	contractAddress: string;

	@Column()
	@Index()
	stakerAddress: string;

	@Column()
	stakedAmount: string;

	@Column()
	blockNumber: number;

	@Column()
	@Index()
	blockTimestamp: number;

	@Column()
	@Index({ unique: true })
	txHash: string;

	@Column(() => DepositStake)
	deposit?: DepositStake;

	@Column(() => WithdrawStake)
	withdraw?: WithdrawStake;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}

export type RawStake = Omit<Stake, "id" | "blockTimestamp" | "createdAt" | "updatedAt">;
