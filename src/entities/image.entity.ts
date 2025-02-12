import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, UpdateDateColumn } from "typeorm";
import { MimeType } from "../common.types";

@Entity("image")
export class OfferImage {
	@ObjectIdColumn()
	id: ObjectId;

	@Column()
	@Index()
	offerType: number;

	@Column()
	@Index()
	offerInstance?: number;

	@Column()
	format: MimeType;

	@Column()
	data: Buffer;

	@Column()
	@CreateDateColumn()
	createdAt: Date;

	@Column()
	@UpdateDateColumn()
	updatedAt: Date;
}
