import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class StakeContract {
	@Column()
	rewardPercentage: number;

	@Column()
	lockTime: number;
}

@Entity("contracts")
export class DeployedContract {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index({ unique: true })
	address: string;

	@Column(() => StakeContract)
	stake?: StakeContract;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
