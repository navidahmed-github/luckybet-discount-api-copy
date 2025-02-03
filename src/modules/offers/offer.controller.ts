import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { DestinationInvalidError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { IUserService } from "../user/user.types";
import { CreateOfferCommand, IOfferService, OfferHistoryDTO, TransferOfferCommand } from "./offer.types";

@Controller("offers")
@ApiBearerAuth()
export class OfferController {
    constructor(
        @Inject(ProviderTokens.OfferService)
        private _offerService: IOfferService,

        @Inject(ProviderTokens.UserService)
        private _userService: IUserService
    ) { }

    @Get("owned/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get offers owned for user" })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    @ApiParam({
        name: "userId",
        description: "Identifier of user for which to return offer (admin role only)",
        required: false,
        type: String,
    })
    async owned(@Request() req, @Param("userId") userId?: string): Promise<string[]> {
        return this._offerService.getOffers(req.user.role == Role.Admin ? userId : req.user.id);
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
    async history(@Request() req, @Param("userId") userId?: string): Promise<OfferHistoryDTO[]> {
        return this._offerService.getHistory(req.user.role == Role.Admin ? userId : req.user.id);
    }

    @Post()
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Create an offer" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async create(@Body() createCommand: CreateOfferCommand): Promise<void> {
        const toAddress = await this.getToAddress(createCommand);
        await this._offerService.create(toAddress, createCommand.offerType, BigInt(createCommand.amount), createCommand.additionalInfo);
    }

    @Post("transfer")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Transfer offers to another user" })
    @ApiResponse({
        status: HttpStatus.OK,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async transfer(@Request() req, @Body() transferCommand: TransferOfferCommand): Promise<void> {
        const asAdmin = req.user.role === Role.Admin;
        const userId = (asAdmin && transferCommand.fromUserId) || req.user.id;
        const toAddress = await this.getToAddress(transferCommand);
        await this._offerService.transfer(userId, toAddress, BigInt(transferCommand.tokenId), asAdmin);
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
