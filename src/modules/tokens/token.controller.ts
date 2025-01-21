import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { ITokenService, TransferTokenCommand } from "./token.types";

@Controller("tokens")
@ApiBearerAuth()
export class TokenController {
    constructor(@Inject(ProviderTokens.TokenService) private tokenService: ITokenService) { }

    @Get("balance")
    @ApiOperation({ summary: "Get balance for user" })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async balance(@Request() req): Promise<string> {
        return this.tokenService.getBalance(req.user.id).toString();
    }

    @Post()
    @ApiOperation({ summary: "Transfer tokens to another user" })
    @ApiResponse({
        status: HttpStatus.OK,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async transfer(@Request() req, @Body() transferCommand: TransferTokenCommand): Promise<void> {
        this.tokenService.transfer(req.user.id, transferCommand.to, BigInt(transferCommand.amount));
    }

    @Post()
    // !! Add admin permission
    @ApiOperation({ summary: "Mint tokens to a user" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async mint(@Body() mintCommand: TransferTokenCommand): Promise<void> {
        this.tokenService.mint(mintCommand.to, BigInt(mintCommand.amount));
    }
}
