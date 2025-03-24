import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, EventLog, id, isAddress, JsonRpcApiProvider, Log, TransactionReceipt } from "ethers";
import { ProviderTokens } from "../../providerTokens";
import { callContract, fromTokenNative, IDestination, parseDestination, toNumberSafe } from "../../common.types";
import { InsufficientBalanceError, MONGO_DUPLICATE_KEY, StakeAlreadyExistsError, StakeCannotCreateError, StakeError, StakeMissingAddressError, StakeNotFoundError, StakeWithdrawError } from "../../error.types";
import { IUserService } from "../user/user.types";
import { DepositStake, RawStake, Stake, WithdrawStake } from "../../entities/stake.entity";
import { DeployedContract } from "../../entities/contract.entity";
import { EVENT_FILTER_DEFAULT_SIZE, TransferServiceSettingKeys } from "../../services/transfer.service";
import { ContractServiceSettingKeys, IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { IProviderService } from "../../services/ethereumProvider.service";
import { IStakeService, StakeHistoryDTO, StakeStatusDTO, StakeType } from "./stake.types";

export const DEPOSIT_TOPIC = id("Staked(address,uint256,uint256,uint256)");
export const WITHDRAW_TOPIC = id("Withdrawn(address,uint256,uint256)");

@Injectable()
export class StakeService implements IStakeService, OnModuleInit, OnModuleDestroy {
    private readonly _logger = new Logger(StakeService.name);
    private readonly _provider: JsonRpcApiProvider;
    private readonly _tokenAddress: string;
    private _disableListener: boolean;
    private _events: Contract[];

    constructor(
        private readonly _config: ConfigService,

        @Inject(ProviderTokens.UserService)
        private readonly _userService: IUserService,

        @Inject(ProviderTokens.ContractService)
        private readonly _contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private readonly _walletService: IWalletService,

        @Inject(ProviderTokens.EthereumProviderService)
        ethereumProviderService: IProviderService,

        @InjectRepository(Stake)
        private readonly _stakeRepository: MongoRepository<Stake>,

        @InjectRepository(DeployedContract)
        private readonly _contractRepository: MongoRepository<DeployedContract>
    ) {
        this._provider = ethereumProviderService.getProvider();
        this._tokenAddress = this._config.get(ContractServiceSettingKeys.TOKEN_CONTRACT_ADDRESS);
    }

    public async onModuleInit() {
        this._disableListener = false;
        const currentBlock = await this._provider.getBlockNumber();
        const contracts = await this.getAll();
        this._events = [];
        for (const contract of contracts) {
            this._events.push(await this.initialiseContract(contract.address, currentBlock))
        }
    }

    public async onModuleDestroy() {
        this._events?.forEach(c => this.destroyContract(c));
    }

    public async getAll(): Promise<DeployedContract[]> {
        this._logger.verbose("Retrieving all staking contracts");
        const contracts = await this._contractRepository.find();
        return contracts.filter(c => "stake" in c);
    }

    public async getByAddress(address: string): Promise<DeployedContract> {
        this._logger.verbose(`Retrieving staking contract: ${address}`);
        if (!address) {
            throw new StakeMissingAddressError();
        }
        if (!isAddress(address)) {
            throw new StakeNotFoundError(`Not a valid Ethereum address: ${address}`);
        }
        const contract = await this._contractRepository.findOne({ where: { address } });
        if (!contract?.stake) {
            throw new StakeNotFoundError(address);
        }
        return contract;
    }

    public async addContract(address: string): Promise<DeployedContract> {
        this._logger.verbose(`Adding staking contract: ${address}`);
        if (!address) {
            throw new StakeMissingAddressError();
        }
        if (!isAddress(address)) {
            throw new StakeCannotCreateError(`Not a valid Ethereum address: ${address}`);
        }
        if (await this._contractRepository.findOne({ where: { address } })) {
            throw new StakeAlreadyExistsError(address);
        }

        const staking = await this._contractService.stakeContract(address);
        try {
            if (!await staking.supportsInterface("0x2919aabb")) {
                throw new Error();
            }
        } catch {
            throw new StakeCannotCreateError(`Staking contract not detected at ${address}`);
        }
        if (await staking.underlyingToken() != this._tokenAddress) {
            throw new StakeCannotCreateError("Staking contract underlying token mismatch")
        }

        const adminWallet = this._walletService.getAdminWallet();
        const token = await this._contractService.tokenContract(adminWallet);
        const MINTER_ROLE = await token.MINTER_ROLE();
        if (!await token.hasRole(MINTER_ROLE, address)) {
            await this._walletService.gasWallet(adminWallet);
            await token.grantRole(MINTER_ROLE, address);
        }

        try {
            const lockTime = toNumberSafe(await staking.lockTime());
            const rewardPercentage = 100 * toNumberSafe(await staking.rewardPercentage()) / toNumberSafe(await staking.REWARD_DIVISOR());
            await this._contractRepository.save({ address, stake: { rewardPercentage, lockTime } });
            return await this.getByAddress(address);
        } catch (err) {
            // unique constraint will ensure that race conditions are handled
            if (err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)
                throw new StakeAlreadyExistsError(address);
            throw new StakeCannotCreateError(err.message);
        }
    }

    public async getHistory(dest: IDestination): Promise<StakeHistoryDTO[]> {
        const [address] = await parseDestination(this._userService, dest);
        this._logger.verbose(`Retrieving stake history for address: ${address}`);
        const stakes = await this._stakeRepository.find({
            where: { stakerAddress: address },
            order: { blockTimestamp: "ASC" }
        })
        return stakes.map(toHistory).filter(Boolean);

        function toHistory(stake: Stake): StakeHistoryDTO {
            try {
                const dto = stake.withdraw ?
                    { type: StakeType.Withdrawal, reward: fromTokenNative(BigInt(stake.withdraw.rewardAmount)) } :
                    { type: StakeType.Deposit }
                return {
                    ...dto,
                    contractAddress: stake.contractAddress,
                    staked: fromTokenNative(BigInt(stake.stakedAmount)),
                    txHash: stake.txHash,
                    timestamp: stake.blockTimestamp
                };
            } catch (err) {
                this._logger.error(`Failed to parse history record with txHash: ${stake.txHash}, reason: ${err.message}`);
                return null;
            }
        }
    }

    public async getStatus(contractAddress: string, userId: string): Promise<StakeStatusDTO> {
        const wallet = await this._userService.getUserWallet(userId);
        const staking = await this._contractService.stakeContract(contractAddress);
        const locked = fromTokenNative(await staking.lockedAmount(wallet.address));
        const unlocked = fromTokenNative(await staking.unlockedAmount(wallet.address));
        const reward = fromTokenNative(await staking.rewardAmount(wallet.address));
        return { unlocked, locked, reward };
    }

    public async deposit(contractAddress: string, userId: string, amount: bigint): Promise<RawStake> {
        this._logger.verbose(`Stake tokens for user: ${userId}, contract: ${contractAddress}, amount: ${amount}`);
        await this.getByAddress(contractAddress); // check exists
        const wallet = await this._userService.getUserWallet(userId);
        const token = await this._contractService.tokenContract(wallet);
        const staking = await this._contractService.stakeContract(contractAddress, wallet);

        const balance = await token.balanceOf(wallet.address);
        if (balance < amount) {
            throw new InsufficientBalanceError(`Attempting to stake ${amount} tokens when only ${balance} available`);
        }

        await this._walletService.gasWallet(wallet);
        const txApprove = await callContract(() => token.approve(contractAddress, amount), token);
        await txApprove.wait();
        const tx = await callContract(() => staking.stake(amount), staking);
        return this.lockStake(async () => {
            const txReceipt: TransactionReceipt = await tx.wait();
            const unlockTime: bigint = (txReceipt.logs.find(l => l.topics[0] === DEPOSIT_TOPIC) as EventLog)?.args[2];
            if (!unlockTime) {
                throw new StakeError("Failed to read unlock time from event");
            }
            const depositFields = { unlockTime: toNumberSafe(unlockTime) }
            return this.saveStake(contractAddress, wallet.address, amount, txReceipt.blockNumber, txReceipt.hash, depositFields);
        });
    }

    public async withdraw(contractAddress: string, userId: string): Promise<RawStake> {
        this._logger.verbose(`Withdraw tokens for user: ${userId}, contract: ${contractAddress}`);
        await this.getByAddress(contractAddress); // check exists
        const wallet = await this._userService.getUserWallet(userId);
        const staking = await this._contractService.stakeContract(contractAddress, wallet);

        if (!(await staking.unlockedAmount(wallet.address))) {
            throw new StakeWithdrawError((await staking.lockedAmount(wallet.address)) ?
                "Unable to withdraw as lock period has not passed" :
                "Unable to withdraw as nothing staked");
        }

        await this._walletService.gasWallet(wallet);
        const tx = await callContract(() => staking.withdraw(), staking);
        return this.lockStake(async () => {
            const txReceipt: TransactionReceipt = await tx.wait();
            const log = txReceipt.logs.find(l => l.topics[0] === WITHDRAW_TOPIC) as EventLog;
            const stake: bigint = log?.args[1];
            const reward: bigint = log?.args[2];
            if (!stake || !reward) {
                throw new StakeError("Failed to read stake/reward from event");
            }
            const withdrawFields = { rewardAmount: reward.toString() };
            return this.saveStake(contractAddress, wallet.address, stake, txReceipt.blockNumber, txReceipt.hash, withdrawFields);
        });
    }

    private async initialiseContract(address: string, currentBlock: number): Promise<Contract> {
        const event = await this._contractService.stakeContract(address);
        const filterSize = Number(this._config.get(TransferServiceSettingKeys.EVENT_FILTER_SIZE) ?? EVENT_FILTER_DEFAULT_SIZE);
        const depositEvts = await event.queryFilter("Staked", Math.max(currentBlock - filterSize, 0), currentBlock);
        Promise.allSettled(depositEvts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveStake(address, evt.args[0], evt.args[3], evt.blockNumber, evt.transactionHash, { unlockTime: toNumberSafe(evt.args[2]) })));
        const withdrawEvts = await event.queryFilter("Withdrawn", Math.max(currentBlock - filterSize, 0), currentBlock);
        Promise.allSettled(withdrawEvts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveStake(address, evt.args[0], evt.args[1], evt.blockNumber, evt.transactionHash, { rewardAmount: evt.args[2].toString() })));
        event.on("Staked", this.depositListener(address));
        event.on("Withdrawn", this.withdrawListener(address));
        return event;
    }

    private async destroyContract(contract: Contract) {
        contract.off("Staked");
        contract.off("Withdrawn");
    }

    private async lockStake<T>(fn: () => Promise<T>): Promise<T> {
        try {
            this._disableListener = true;
            return await fn();
        } finally {
            this._disableListener = false;
        }
    }

    private async saveStake(
        contractAddress: string,
        stakerAddress: string,
        stakedAmount: bigint,
        blockNumber: number,
        txHash: string,
        otherFields: DepositStake | WithdrawStake
    ): Promise<RawStake> {
        const embedded = "rewardAmount" in otherFields ? { withdraw: { ...otherFields } } : { deposit: { ...otherFields } };
        const stake = { contractAddress, stakerAddress, stakedAmount: stakedAmount.toString(), blockNumber, txHash, ...embedded };
        try {
            if (!await this._stakeRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                return await this._stakeRepository.save({ ...stake, blockTimestamp });
            }
        } catch (err) {
            if (!(err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)) // ignore if already exists
                this._logger.error(`Failed to write stake with txHash: ${txHash}, reason: ${err.messsage}`, err.stack);
        }
        return stake;
    }

    private depositListener = (contract: string) => async (staker: string, unlockTime: bigint, amount: bigint, { log }: { log: Log }) => {
        if (!this._disableListener) {
            await this.saveStake(contract, staker, amount, log.blockNumber, log.transactionHash, { unlockTime: toNumberSafe(unlockTime) });
        }
    }

    private withdrawListener = (contract: string) => async (staker: string, stake: bigint, reward: bigint, { log }: { log: Log }) => {
        if (!this._disableListener) {
            await this.saveStake(contract, staker, stake, log.blockNumber, log.transactionHash, { rewardAmount: reward.toString() });
        }
    }
}
