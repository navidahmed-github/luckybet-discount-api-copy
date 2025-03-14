import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";

Entity()
export class Attribute {
	@Column()
	name: string;

	@Column()
	value: string | number;

	@Column()
	type?: string
}

Entity()
export class Metadata {
	@Column()
	name: string;

	@Column()
	description: string;

	@Column(() => Attribute, { array: true })
	attributes: Attribute[];
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
