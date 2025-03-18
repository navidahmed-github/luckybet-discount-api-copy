import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IDestination } from "../../common.types";
import { RawStake } from "../../entities/stake.entity";
import { DeployedContract } from "../../entities/contract.entity";
import { IsNotEmpty } from "class-validator";

export enum StakeType {
    Deposit = 'Deposit',
    Withdrawal = 'Withdrawal'
}

export class DepositStakeCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Amount to stake",
        type: Number,
    })
    amount: number;
}

export class StakeContractDTO {
    @ApiProperty({
        description: "Deployed address of staking contract",
        type: String,
    })
    address: string;

    @ApiProperty({
        description: "Reward percentage given once lock time has expired",
        type: Number,
    })
    rewardPercentage: number;

    @ApiProperty({
        description: "Minimum time in seconds stake will be held before it can be released",
        type: String,
    })
    lockTime: number;
}

export class StakeStatusDTO {
    @ApiProperty({
        description: "Amount of stake locked in contract (ie. not able to be withdrawn)",
        type: Number,
    })
    locked: number;

    @ApiProperty({
        description: "Amount of stake unlocked in contract (ie. able to be withdrawn)",
        type: Number,
    })
    unlocked: number;

    @ApiProperty({
        description: "Amount of tokens which will be returned as a reward once unlocked stake withdrawn",
        type: Number,
    })
    reward: number // !! inconsistent reward vs rewardAmount
}

export class StakeHistoryDTO {
    @ApiProperty({
        description: "Type of record",
        enum: StakeType,
    })
    type: StakeType;

    @ApiProperty({
        description: "Deployed address of staking contract",
        type: String,
    })
    contractAddress: string;

    @ApiProperty({
        description: "Amount staked/returned",
        type: Number,
    })
    stakedAmount: number;

    @ApiPropertyOptional({
        description: "Reward amount for withdrawals",
        type: Number,
    })
    rewardAmount?: number;

    @ApiProperty({
        description: "Transaction hash associated with stake",
        type: String,
    })
    txHash: string;

    @ApiProperty({
        description: "Timestamp when the event occurred",
        type: Number,
    })
    timestamp: number;
}

export class StakeWithdrawDTO {
    @ApiProperty({
        description: "Amount of stake returned",
        type: Number,
    })
    staked: number;

    @ApiProperty({
        description: "Amount of reward returned",
        type: Number,
    })
    reward: number;
}

export interface IStakeService {
    getAll(): Promise<DeployedContract[]>;
    getByAddress(address: string): Promise<DeployedContract>;
    addContract(address: string): Promise<DeployedContract>;
    getHistory(dest: IDestination): Promise<StakeHistoryDTO[]>;
    getStatus(contractAddress: string, userId: string): Promise<StakeStatusDTO>;
    deposit(contractAddress: string, userId: string, amount: bigint): Promise<RawStake>;
    withdraw(contractAddress: string, userId: string): Promise<RawStake>;
}
