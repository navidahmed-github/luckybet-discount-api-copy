import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Request } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { ApiQueryAddress, ApiQueryUserId, fromTokenNative, toTokenNative } from "../../common.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { DeployedContract } from "../../entities/contract.entity";
import { DepositStakeCommand, IStakeService, StakeContractDTO, StakeHistoryDTO, StakeStatusDTO, StakeWithdrawDTO } from "./stake.types";

@Controller("stakes")
@ApiBearerAuth()
export class StakeController {
    constructor(
        @Inject(ProviderTokens.StakeService)
        private _stakeService: IStakeService,
    ) { }

    @Get()
    @ApiOperation({ summary: "Get all staking contracts" })
    @ApiOkResponse({
        description: "Staking contracts were returned successfully",
        type: StakeContractDTO,
        isArray: true,
    })
    async all(): Promise<StakeContractDTO[]> {
        return this._stakeService.getAll().then(u => u.map(this.toDTO));
    }

    @Get("history")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiQueryUserId("Identifier of user for which to return history (admin role only)")
    @ApiQueryAddress("Address for which to return history (admin role only)")
    @ApiOkResponse({ description: "The history was returned successfully" })
    async history(@Request() req, @Query("userId") userId?: string, @Query("address") address?: string): Promise<StakeHistoryDTO[]> {
        const dest = req.user.role === Role.Admin ? { userId, address } : { userId: req.user.id };
        return this._stakeService.getHistory(dest);
    }

    @Get(":address")
    @ApiOperation({ summary: "Get a staking contract" })
    @ApiParam({
        name: "address",
        description: "Deployed address of staking contract to return",
        required: true,
        type: String,
    })
    @ApiOkResponse({
        description: "User was returned successfully",
        type: StakeContractDTO,
    })
    @ApiNotFoundResponse({ description: "Contract could not be found" })
    @ApiBadRequestResponse({ description: "Address is missing" })
    async byAddress(@Param("address") address: string): Promise<StakeContractDTO> {
        return this._stakeService.getByAddress(address).then(this.toDTO);
    }

    @Put(":address")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Add a staking contract" })
    @ApiParam({
        name: "address",
        description: "Deployed address of staking contract to add",
        required: true,
        type: String,
    })
    @ApiCreatedResponse({
        description: "Staking contract was added successfully",
        type: StakeContractDTO,
    })
    @ApiBadRequestResponse({ description: "Missing information or contract already exists" })
    @ApiInternalServerErrorResponse({ description: "Contract could not be saved" })
    @HttpCode(HttpStatus.CREATED)
    async add(@Param("address") address: string): Promise<StakeContractDTO> {
        return this._stakeService.addContract(address).then(this.toDTO);
    }

    @Get(":address/status")
    @Roles(Role.User)
    @ApiOperation({ summary: "Get status of user stake" })
    @ApiParam({
        name: "address",
        description: "Deployed address of staking contract in which to stake",
        required: true,
        type: String,
    })
    @ApiOkResponse({ description: "Stake was added successfully" })
    async status(@Request() req, @Param("address") address: string): Promise<StakeStatusDTO> {
        return this._stakeService.getStatus(address, req.user.id);
    }

    @Post(":address/deposit")
    @Roles(Role.User)
    @ApiOperation({ summary: "Deposit a user stake" })
    @ApiParam({
        name: "address",
        description: "Deployed address of staking contract in which to deposit",
        required: true,
        type: String,
    })
    @ApiOkResponse({ description: "Deposit was successful" })
    async deposit(@Request() req, @Body() cmd: DepositStakeCommand, @Param("address") address: string): Promise<void> {
        await this._stakeService.deposit(address, req.user.id, toTokenNative(cmd.amount));
    }

    @Post(":address/withdraw")
    @Roles(Role.User)
    @ApiOperation({ summary: "Withdraw a user stake" })
    @ApiParam({
        name: "address",
        description: "Deployed address of staking contract in which to withdraw",
        required: true,
        type: String,
    })
    @ApiOkResponse({
        description: "Withdraw was successful",
        type: StakeWithdrawDTO
    })
    async withdraw(@Request() req, @Param("address") address: string): Promise<StakeWithdrawDTO> {
        const stake = await this._stakeService.withdraw(address, req.user.id);
        return { staked: fromTokenNative(BigInt(stake.stakedAmount)), reward: fromTokenNative(BigInt(stake.withdraw.rewardAmount)) };
    }

    private toDTO(contract: DeployedContract): StakeContractDTO {
        return { address: contract.address, rewardPercentage: contract.stake.rewardPercentage, lockTime: contract.stake.lockTime };
    }
}
