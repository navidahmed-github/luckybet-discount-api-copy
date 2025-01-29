import { Repository } from "typeorm";
import { User } from "../../src/entities/user.entity";

export function makeMockUserRepository(user?: User): jest.Mocked<Repository<User>> {
	return {
		metadata: { tableName: "users" },
		data: user ? [user] : [],
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
