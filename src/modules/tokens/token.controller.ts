import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { DestinationInvalidError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { IUserService } from "../user/user.types";
import { HistoryDTO, ITokenService, TransferTokenCommand } from "./token.types";

@Controller("tokens")
@ApiBearerAuth()
export class TokenController {
    constructor(
        @Inject(ProviderTokens.TokenService)
        private tokenService: ITokenService,

        @Inject(ProviderTokens.UserService)
        private userService: IUserService
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
        description: "Identifier of user for which to return balance",
        type: String,
    })
    async balance(@Request() req, @Param("userId") userId?: string): Promise<string> {
        console.log(userId);
        if (req.user.role != Role.Admin) {
            userId = req.user.id;
        }
        return this.tokenService.getBalance(userId).toString();
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
        description: "Identifier of user for which to return balance",
        type: String,
    })
    async history(@Request() req, @Param("userId") userId?: string): Promise<HistoryDTO[]> {
        if (req.user.role != Role.Admin) {
            userId = req.user.id;
        }
        return this.tokenService.getHistory(userId);
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
    async transfer(@Request() req, @Body() transferCommand: TransferTokenCommand & { fromUserId?: string }): Promise<void> {
        const userId = ((req.user.role === Role.Admin) && transferCommand.fromUserId) || req.user.id;
        const toAddress = await this.getToAddress(transferCommand);
        await this.tokenService.transfer(userId, toAddress, BigInt(transferCommand.amount));
    }

    @Post("mint")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Mint tokens to a user" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async mint(@Body() mintCommand: TransferTokenCommand): Promise<void> {
        const toAddress = await this.getToAddress(mintCommand);
        await this.tokenService.mint(toAddress, BigInt(mintCommand.amount));
    }

    private async getToAddress(toDetails: { toAddress?: string, toUserId?: string }): Promise<string> {
        if (toDetails.toUserId) {
            if (toDetails.toAddress)
                throw new DestinationInvalidError("Cannot provide both user and address as destination");
            const wallet = await this.userService.getUserWallet(toDetails.toUserId);
            return wallet.address;
        }
        if (!toDetails.toAddress)
            throw new DestinationInvalidError("No destination provided");
        return toDetails.toAddress;
    }
}
