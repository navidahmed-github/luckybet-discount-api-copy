import { ApiProperty } from "@nestjs/swagger";
import { IDestination } from "../../common.types";
import { RawStake } from "../../entities/stake.entity";
import { DeployedContract } from "../../entities/contract.entity";

export enum StakeType {
    Deposit = 'Deposit',
    Withdrawal = 'Withdrawal'
}

export class StakeContractDTO {
    address: string; // !!

    rewardPercentage: number;

    lockTime: number;
}

export class StakeStatusDTO {
    locked: string;

    unlocked: string;

    reward: string;
}

export class StakeHistoryDTO {
    @ApiProperty({
        description: "Type of record",
        enum: StakeType,
    })
    type: StakeType;

    @ApiProperty({
        description: "Address of staking contract",
        type: String,
    })
    contractAddress: string;

    @ApiProperty({
        description: "Amount staked/returned",
        type: String,
    })
    stakedAmount: string;

    @ApiProperty({
        description: "Reward amount for withdrawals",
        type: String,
    })
    rewardAmount?: string;

    @ApiProperty({
        description: "Timestamp when the event occurred",
        type: Number,
    })
    timestamp: number;
}

export class UserWithdrawDTO {
    @ApiProperty({
        description: "Amount staked",
        type: String,
    })
    staked: string;

    @ApiProperty({
        description: "Amount staked",
        type: String,
    })
    rewards: string;
}

export class StakeCommand {
    @ApiProperty({
        description: "Amount to stake",
        type: String,
    })
    amount: string;
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
