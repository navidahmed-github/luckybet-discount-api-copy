import { Repository } from "typeorm";
import { User } from "../../src/entities/user.entity";
import { Transfer } from "../../src/entities/transfer.entity";

function makeMockRepository<T>(tableName: string, queryParam: string): jest.Mocked<Repository<T>> {
	return {
		metadata: { tableName },
		data: [],
		find: jest.fn(async function (): Promise<T[]> {
			return this.data;
		}),
		findOne: jest.fn(async function (query: any): Promise<T | undefined> {
			const where = query?.where ?? {};
			return where[queryParam] ? this.data.find(u => u[queryParam] == where[queryParam]) : undefined;
		}),
		save: jest.fn(async function (_data: Partial<T>): Promise<T> {
			this.data = [...this.data, _data];
			return _data as T;
		}),
	} as any;
}

export function makeMockUserRepository() {
	return makeMockRepository<User>("users", "userId");
}

export function makeMockTransferRepository() {
	return makeMockRepository<Transfer>("transfers", "txHash");
}
