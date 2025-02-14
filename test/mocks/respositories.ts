import { Repository } from "typeorm";
import { v4 as uuid_v4 } from 'uuid';
import { User } from "../../src/entities/user.entity";
import { Transfer } from "../../src/entities/transfer.entity";
import { Template } from "../../src/entities/template.entity";
import { OfferImage } from "../../src/entities/image.entity";
import { AirdropChunk } from "../../src/entities/airdrop.entity";

function makeMockRepository<T>(tableName: string): jest.Mocked<Repository<T>> {
	return {
		metadata: { tableName },
		data: [],
		find: jest.fn(async function (query: any): Promise<T[]> {
			const where = query?.where ?? {};
			return this.data.filter(d => Object.entries(where).every(([k, v]) => !v || d[k] == v));
		}),
		findOne: jest.fn(async function (query: any): Promise<T | undefined> {
			const where = query?.where ?? {};
			return this.data.find(d => Object.entries(where).every(([k, v]) => !v || d[k] == v));
		}),
		save: jest.fn(async function (_data: Partial<T>): Promise<T> {
			this.data = [...this.data, { ..._data, id: uuid_v4() }];
			return _data as T;
		}),
		delete: jest.fn(async function (id: string): Promise<void> {
			this.data = this.data.filter(d => d.id != id);
		}),
	} as any;
}

export function makeMockUserRepository() {
	return makeMockRepository<User>("users");
}

export function makeMockTransferRepository() {
	return makeMockRepository<Transfer>("transfers");
}

export function makeMockTemplateRepository() {
	return makeMockRepository<Template>("templates");
}

export function makeMockImageRepository() {
	return makeMockRepository<OfferImage>("images");
}

export function makeMockAirdropRepository() {
	return makeMockRepository<AirdropChunk>("airdrops");
}
