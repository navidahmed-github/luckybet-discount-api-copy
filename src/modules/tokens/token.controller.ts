import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Request } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiInternalServerErrorResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { DestinationInvalidError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { IUserService } from "../user/user.types";
import { CreateTokenCommand, TokenHistoryDTO, ITokenService, TransferTokenCommand, TokenBalanceDTO, TokenTransferDTO, DestroyTokenCommand } from "./token.types";

@Controller("tokens")
@ApiBearerAuth()
export class TokenController {
    constructor(
        @Inject(ProviderTokens.TokenService)
        private _tokenService: ITokenService,

        @Inject(ProviderTokens.UserService)
        private _userService: IUserService
    ) { }

    @Get("owned/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get balance for user" })
    @ApiParam({
        name: "userId",
        description: "Identifier of user for which to return balance (admin role only)",
        required: false,
        type: String,
    })
    @ApiOkResponse({
        description: "Balance was returned successfully",
        type: TokenBalanceDTO,
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    @ApiInternalServerErrorResponse({ description: "Wallet mismatch" })
    async balance(@Request() req, @Param("userId") userId?: string): Promise<TokenBalanceDTO> {
        const balance = await this._tokenService.getBalance(req.user.role === Role.Admin ? userId : req.user.id);
        return { balance: balance.toString() };
    }

    @Get("history/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiParam({
        name: "userId",
        description: "Identifier of user for which to return history (admin role only)",
        required: false,
        type: String,
    })
    @ApiOkResponse({
        description: "History was returned successfully",
        type: TokenHistoryDTO,
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    async history(@Request() req, @Param("userId") userId?: string): Promise<TokenHistoryDTO[]> {
        return this._tokenService.getHistory(req.user.role === Role.Admin ? userId : req.user.id);
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
        const toAddress = await this.getToAddress(cmd);
        const rawTransfer = await this._tokenService.create(toAddress, BigInt(cmd.amount));
        return { ...rawTransfer, amount: rawTransfer.token.amount }
    }

    @Delete()
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Destroy tokens from Lucky Bet wallet" })
    @ApiNoContentResponse({ description: "Tokens were burnt successfully" })
    @ApiInternalServerErrorResponse({ description: "Failed to burn tokens" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async destroy(@Body() cmd: DestroyTokenCommand): Promise<void> {
        await this._tokenService.destroy(BigInt(cmd.amount));
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
        const toAddress = await this.getToAddress(cmd);
        const rawTransfer = await this._tokenService.transfer(userId, toAddress, BigInt(cmd.amount), asAdmin);
        return { ...rawTransfer, amount: rawTransfer.token.amount };
    }

    private async getToAddress(toDetails: { toAddress?: string, toUserId?: string }): Promise<string> {
        if (toDetails.toUserId) {
            if (toDetails.toAddress)
                throw new DestinationInvalidError("Cannot provide both user and address as destination");
            const wallet = await this._userService.getUserWallet(toDetails.toUserId);
            return wallet.address;
        }
        if (!toDetails.toAddress)
            throw new DestinationInvalidError("No destination provided");
        return toDetails.toAddress;
    }
}
