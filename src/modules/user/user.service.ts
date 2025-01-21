import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository, Repository } from "typeorm";
import { Wallet } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { UserNotFoundError } from "../../errors";
import { IAtomicSequenceService } from "../../services/atomicSequence.service";
import { User } from "../../entities/user.entity";
import { IUserService, UserDTO } from "./user.types";

@Injectable()
export class UserService implements IUserService, OnModuleInit {
	private readonly logger = new Logger(UserService.name);

	constructor(
		@Inject(ProviderTokens.AtomicSequenceService)
		private atomicSequenceService: IAtomicSequenceService,

		@InjectRepository(User)
		private userRepository: Repository<User>,
	) { }

	async onModuleInit() {
		await this.atomicSequenceService.moduleInit(this.userRepository.metadata.tableName);
		// For standard test module there is no database so ignore
		if (this.userRepository instanceof MongoRepository)
			await (this.userRepository as MongoRepository<User>).createCollectionIndex("userId", { unique: true });
	}

	async findAll(): Promise<UserDTO[]> {
		this.logger.verbose("Retrieving all users");
		const userRecords = await this.userRepository.find();
		await this.userRepository.save({
			userId: "User" + userRecords.length,
			ordinal: userRecords.length
		})
		return userRecords.map(user => UserService.toDTO(user));
	}

	async getEntityById(userId: string): Promise<User | null> {
		return this.userRepository.findOne({
			where: { userId },
		});
	}

	async getById(userId: string): Promise<UserDTO> {
		this.logger.verbose(`Retrieving user with id ${userId}`);
		const userRecord = await this.getEntityById(userId);
		if (!userRecord) {
			throw new UserNotFoundError(userId);
		}
		return UserService.toDTO(userRecord);
	}

	async getUserWallet(userId: string): Promise<Wallet> {
		this.logger.verbose(`Retrieving wallet for user with id ${userId}`);
		const userRecord = await this.getEntityById(userId);
		if (!userRecord) {
			throw new UserNotFoundError(userId);
		}
		return null; // !! this.walletService.getWallet(userRecord.ordinal);
	}

	async create(userId: string, options = { waitOnTransaction: false }): Promise<UserDTO> {
		const ordinal = await this.atomicSequenceService.getNextSequence(this.userRepository.metadata.tableName);

		await this.userRepository.save({ userId, ordinal })

		return new UserDTO();
	}

	static toDTO(user: User): UserDTO {
		return {
			id: user.userId,
			address: user.address,
		};
	}
}
