import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { DestinationInvalidError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { IUserService } from "../user/user.types";
import { CreateTokenCommand, TokenHistoryDTO, ITokenService, TransferTokenCommand  } from "./token.types";

@Controller("tokens")
@ApiBearerAuth()
export class TokenController {
    constructor(
        @Inject(ProviderTokens.TokenService)
        private _tokenService: ITokenService,

        @Inject(ProviderTokens.UserService)
        private _userService: IUserService
    ) { }

    @Get("balance/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get balance for user" })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    @ApiParam({
        name: "userId",
        description: "Identifier of user for which to return balance (admin role only)",
        required: false,
        type: String,
    })
    async balance(@Request() req, @Param("userId") userId?: string): Promise<string> {
        return (await this._tokenService.getBalance(req.user.role == Role.Admin ? userId : req.user.id)).toString();
    }

    @Get("history/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    @ApiParam({
        name: "userId",
        description: "Identifier of user for which to return history (admin role only)",
        required: false,
        type: String,
    })
    async history(@Request() req, @Param("userId") userId?: string): Promise<TokenHistoryDTO[]> {
        return this._tokenService.getHistory(req.user.role == Role.Admin ? userId : req.user.id);
    }

    @Post()
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Allocate tokens to a user" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async create(@Body() cmd: CreateTokenCommand): Promise<void> {
        const toAddress = await this.getToAddress(cmd);
        await this._tokenService.create(toAddress, BigInt(cmd.amount));
    }

    @Post("transfer")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Transfer tokens to another user" })
    @ApiResponse({
        status: HttpStatus.OK,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async transfer(@Request() req, @Body() cmd: TransferTokenCommand): Promise<void> {
        const asAdmin = req.user.role === Role.Admin;
        const userId = (asAdmin && cmd.fromUserId) || req.user.id;
        const toAddress = await this.getToAddress(cmd);
        await this._tokenService.transfer(userId, toAddress, BigInt(cmd.amount), asAdmin);
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
