import { Repository } from "typeorm";
import { User } from "../../src/entities/user.entity";
import { Transfer } from "../../src/entities/transfer.entity";

export function makeMockUserRepository(): jest.Mocked<Repository<User>> {
	return {
		metadata: { tableName: "users" },
		data: [],
		find: jest.fn(async function (): Promise<User[]> {
			return this.data;
		}),
		findOne: jest.fn(async function (query: any): Promise<User | undefined> {
			const where = query?.where ?? {};
			return where.userId ? this.data.find(u => u.userId == where.userId) : undefined;
		}),
		save: jest.fn(async function (_data: Partial<User>): Promise<User> {
			this.data = [...this.data, _data];
			return this.data;
		}),
	} as any;
}

export function makeMockTransferRepository(): jest.Mocked<Repository<Transfer>> {
	return {
		metadata: { tableName: "users" },
		data: [],
		find: jest.fn(async function (): Promise<Transfer[]> {
			return this.data;
		}),
		findOne: jest.fn(async function (query: any): Promise<Transfer | undefined> {
			const where = query?.where ?? {};
			return where.userId ? this.data.find(u => u.userId == where.userId) : undefined;
		}),
		save: jest.fn(async function (_data: Partial<Transfer>): Promise<Transfer> {
			this.data = [...this.data, _data];
			return this.data;
		}),
	} as any;
}
