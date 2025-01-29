import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Wallet } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { MONGO_DUPLICATE_KEY, UserAlreadyExistsError, UserCannotCreateError, UserMismatchAddressError, UserMissingIdError, UserNotFoundError } from "../../error.types";
import { IWalletService } from "../../services/wallet.service";
import { IAtomicSequenceService } from "../../services/atomicSequence.service";
import { User } from "../../entities/user.entity";
import { IUserService, UserDTO } from "./user.types";

@Injectable()
export class UserService implements IUserService, OnModuleInit {
	private readonly _logger = new Logger(UserService.name);

	constructor(
		@Inject(ProviderTokens.WalletService)
		private _walletService: IWalletService,

		@Inject(ProviderTokens.AtomicSequenceService)
		private _atomicSequenceService: IAtomicSequenceService,

		@InjectRepository(User)
		private _userRepository: MongoRepository<User>,
	) { }

	public async onModuleInit() {
		await this._atomicSequenceService.moduleInit(this._userRepository.metadata.tableName);
	}

	public async getAll(): Promise<UserDTO[]> {
		this._logger.verbose("Retrieving all users");
		const users = await this._userRepository.find();
		return users.map(User.toDTO);
	}

	public async getById(userId: string): Promise<UserDTO> {
		this._logger.verbose(`Retrieving user: ${userId}`);
		return this.getEntityById(userId).then(User.toDTO);
	}

	public async getUserWallet(userId: string): Promise<Wallet> {
		this._logger.verbose(`Retrieving wallet for user: ${userId}`);
		const user = await this.getEntityById(userId);
		const wallet = this._walletService.getWallet(user.ordinal);
		if (wallet.address != user.address) {
			throw new UserMismatchAddressError(`Existing address:${user.address} does not match derived: ${wallet.address} for ${userId}`);
		}
		return wallet;
	}

	public async create(userId: string): Promise<UserDTO> {
		this._logger.verbose(`Creating user: ${userId}`);
		if (!userId) {
			throw new UserMissingIdError();
		}
		if (await this._userRepository.findOne({ where: { userId } })) {
			throw new UserAlreadyExistsError(userId);
		}
		const ordinal = await this._atomicSequenceService.getNextSequence(this._userRepository.metadata.tableName);
		try {
			const wallet = this._walletService.getWallet(ordinal);
			await this._userRepository.save({ userId, ordinal, address: wallet.address });
			return await this.getById(userId);
		} catch (err) {
			// unique constraint will ensure that race conditions are handled
			if (err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)
				throw new UserAlreadyExistsError(userId);
			throw new UserCannotCreateError(err.message)
		}
	}

	private async getEntityById(userId: string): Promise<User> {
		if (!userId) {
			throw new UserMissingIdError();
		}
		const user = await this._userRepository.findOne({ where: { userId } });
		if (!user) {
			throw new UserNotFoundError(userId);
		}
		return user;
	}
}
