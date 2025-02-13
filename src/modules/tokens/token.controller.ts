import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, Request } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiInternalServerErrorResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { ApiQueryAddress, ApiQueryUserId } from "../../common.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { TokenHistoryDTO, ITokenService, TransferTokenCommand, TokenBalanceDTO, TokenTransferDTO, AirdropCommand, AirdropResponse, AirdropStatus, CreateTokenCommand } from "./token.types";

@Controller("tokens")
@ApiBearerAuth()
export class TokenController {
    constructor(
        @Inject(ProviderTokens.TokenService)
        private _tokenService: ITokenService,
    ) { }

    @Get("owned")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get balance for user" })
    @ApiQueryUserId("Identifier of user for which to return balance (admin role only)")
    @ApiQueryAddress("Address for which to return balance (admin role only)")
    @ApiOkResponse({
        description: "Balance was returned successfully",
        type: TokenBalanceDTO,
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    @ApiInternalServerErrorResponse({ description: "Wallet mismatch" })
    async balance(@Request() req, @Query("userId") userId?: string, @Query("address") address?: string): Promise<TokenBalanceDTO> {
        const dest = req.user.role === Role.Admin ? { userId, address } : { userId: req.user.id };
        const balance = await this._tokenService.getBalance(dest);
        return { balance: balance.toString() };
    }

    @Get("history")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiQueryUserId("Identifier of user for which to return history (admin role only)")
    @ApiQueryAddress("Address for which to return history (admin role only)")
    @ApiOkResponse({
        description: "History was returned successfully",
        type: TokenHistoryDTO,
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    async history(@Request() req, @Query("userId") userId?: string, @Query("address") address?: string): Promise<TokenHistoryDTO[]> {
        const dest = req.user.role === Role.Admin ? { userId, address } : { userId: req.user.id };
        return this._tokenService.getHistory(dest);
    }

    @Post()
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Allocate tokens to a user" })
    @ApiCreatedResponse({
        description: "Tokens were minted successfully",
        type: TokenTransferDTO,
    })
    @ApiInternalServerErrorResponse({ description: "Failed to mint tokens" })
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() cmd: CreateTokenCommand): Promise<TokenTransferDTO> {
        const rawTransfer = await this._tokenService.create(cmd.to, BigInt(cmd.amount));
        return { ...rawTransfer, amount: rawTransfer.token.amount }
    }

    @Delete(":amount")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Destroy tokens from Lucky Bet wallet" })
    @ApiParam({
        name: "amount",
        description: "Amount of tokens to burn",
        required: true,
        type: String,
    })
    @ApiNoContentResponse({ description: "Tokens were burnt successfully" })
    @ApiInternalServerErrorResponse({ description: "Failed to burn tokens" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async destroy(@Param("amount") amount: string): Promise<void> {
        await this._tokenService.destroy(BigInt(amount));
    }

    @Post("transfer")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Transfer tokens to another user" })
    @ApiOkResponse({
        description: "Tokens were transferred successfully",
        type: TokenTransferDTO,
    })
    @ApiBadRequestResponse({ description: "Invalid destination format" })
    @ApiInternalServerErrorResponse({ description: "Failed to transfer tokens" })
    async transfer(@Request() req, @Body() cmd: TransferTokenCommand): Promise<TokenTransferDTO> {
        const asAdmin = req.user.role === Role.Admin;
        const userId = (asAdmin && cmd.fromUserId) || req.user.id;
        const rawTransfer = await this._tokenService.transfer({ userId, asAdmin }, cmd.to, BigInt(cmd.amount));
        return { ...rawTransfer, amount: rawTransfer.token.amount };
    }

    @Post("airdrop")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Mint tokens to multiple destinations" })
    @ApiOkResponse({ description: "The minting request was submitted successfully" })
    @HttpCode(HttpStatus.ACCEPTED)
    async airdrop(@Body() cmd: AirdropCommand): Promise<AirdropResponse> {
        const requestId = await this._tokenService.airdrop(cmd.destinations, BigInt(cmd.amount));
        return { requestId };
    }

    @Get("airdrop/status/:requestId")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Get status of specified airdrop" })
    @ApiParam({
        name: "requestId",
        description: "Identifier of airdrop request for which to retrieve status",
        required: true,
        type: String,
    })
    @ApiOkResponse({ description: "The status was successfully returned" })
    async airdropStatus(@Param("requestId") requestId: string): Promise<AirdropStatus> {
        return await this._tokenService.airdropStatus(requestId);
    }
}
