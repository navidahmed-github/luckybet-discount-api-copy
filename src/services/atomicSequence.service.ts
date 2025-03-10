import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { MongoDriver } from "typeorm/driver/mongodb/MongoDriver";
import { MongoQueryRunner } from "typeorm/driver/mongodb/MongoQueryRunner";

export interface IAtomicSequenceService {
	moduleInit(name: string): Promise<void>;
	getNextSequence(name: string): Promise<number>;
}

const SEQUENCE_TABLE_NAME = "atomicSequence";

@Injectable()
export class AtomicSequenceService implements IAtomicSequenceService {
	private runner: MongoQueryRunner;

	constructor(private dataSource: DataSource) {}

	async moduleInit(name: string): Promise<void> {
		if (this.dataSource.options.type !== "mongodb") throw new Error("AtomicSequenceService only supports MongoDB");

		this.runner = (this.dataSource.driver as MongoDriver)?.queryRunner;
		if (!this.runner) throw new Error("AtomicSequenceService failed to create query runner");
		if (!(await this.runner.count(SEQUENCE_TABLE_NAME, { name }))) await this.runner.insertOne(SEQUENCE_TABLE_NAME, { name, seq: 1 });
	}

	async getNextSequence(name: string): Promise<number> {
		const result = await this.runner.findOneAndUpdate(SEQUENCE_TABLE_NAME, { name }, { $inc: { seq: 1 } });
		return result.seq as number;
	}
}
