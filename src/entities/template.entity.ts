import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

Entity()
export class Metadata {
	@Column()
	name: string;

	@Column()
	description: string;

	@Column()
	attributes: object;
}

@Entity("templates")
export class Template {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index()
	offerType: number;

	@Column()
	@Index()
	offerInstance?: number;

	@Column(() => Metadata)
	metadata: Metadata;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
