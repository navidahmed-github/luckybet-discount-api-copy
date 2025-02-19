import { Repository } from "typeorm";
import { v4 as uuid_v4 } from 'uuid';
import { User } from "../../src/entities/user.entity";
import { Transfer } from "../../src/entities/transfer.entity";
import { Template } from "../../src/entities/template.entity";
import { OfferImage } from "../../src/entities/image.entity";
import { AirdropChunk } from "../../src/entities/airdrop.entity";
import { Stake } from "../../src/entities/stake.entity";
import { DeployedContract } from "../../src/entities/contract.entity";

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
		save: jest.fn(async function (data_: Partial<T>): Promise<T> {
			this.data = [...this.data, { ...data_, id: uuid_v4() }];
			return data_ as T;
		}),
		update: jest.fn(async function (id: string, data_: Partial<T>): Promise<T> {
			const result = this.data.find(d => d.id == id);
			if (result) {
				Object.assign(result, { ...data_ }, id);
			}
			return result;
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

export function makeMockStakeRepository() {
	return makeMockRepository<Stake>("stakes");
}

export function makeMockContractRepository() {
	return makeMockRepository<DeployedContract>("contracts");
}
