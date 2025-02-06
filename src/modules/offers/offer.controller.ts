import { Body, Controller, Delete, Get, Header, HttpStatus, Inject, Param, ParseIntPipe, Post, Put, Query, Request, Res, StreamableFile, UnsupportedMediaTypeException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { createReadStream } from "fs";
import { ProviderTokens } from "../../providerTokens";
import { MimeType } from "../../common.types";
import { DestinationInvalidError, OfferNotFoundError, OfferTokenIdError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { IUserService } from "../user/user.types";
import { CreateTemplateCommand, CreateOfferCommand, IOfferService, OfferHistoryDTO, TransferOfferCommand } from "./offer.types";

const DEFAULT_IMAGE_NAME = "LuckyBetOffer.png";
const DEFAULT_IMAGE_TYPE = MimeType.PNG;

@Controller("offers")
@ApiBearerAuth()
export class OfferController {
    constructor(
        @Inject(ProviderTokens.OfferService)
        private _offerService: IOfferService,

        @Inject(ProviderTokens.UserService)
        private _userService: IUserService
    ) { }

    @Get(":tokenId")
    @ApiOperation({ summary: "Get metadata associated with token identifier" })
    @ApiParam({
        name: "tokenId",
        description: "Identifier of offer for which to return metadata",
        required: true,
        type: String,
    })
    @ApiQuery({
        name: "detailed",
        required: false
    })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async metadata(@Param("tokenId") tokenId: string, @Query("detailed") detailed?: boolean): Promise<any> {
        const [offerType, offerInstance] = this.parseTokenId(tokenId);
        const metadata = await this._offerService.getMetadata(offerType, offerInstance, detailed);
        if (!metadata) {
            throw new OfferNotFoundError(tokenId);
        }
        if (!tokenId.endsWith(".json") || tokenId.length != 69) {
            throw new OfferTokenIdError("Invalid format for token identifier");
        }
        const image = await this._offerService.getImage(offerType, offerInstance);
        const imagePath = image ? tokenId.replace("json", this.getImageSuffix(image.format)) : DEFAULT_IMAGE_NAME;
        return { ...metadata, image: process.env.SERVER_URL + "/offers/image/" + imagePath };
    }

    @Get("image/:tokenId")
    @ApiOperation({ summary: "Get image associated with token identifier" })
    @ApiResponse({
        status: HttpStatus.OK,
        type: String,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    @ApiParam({
        name: "tokenId",
        description: "Identifier of offer for which to return image",
        required: true,
        type: String,
    })
    @Header('Content-Disposition', 'inline')
    async img(@Param("tokenId") tokenId: string, @Res({ passthrough: true }) res) {
        if (tokenId === DEFAULT_IMAGE_NAME) {
            res.contentType(DEFAULT_IMAGE_TYPE);
            return new StreamableFile(createReadStream(`assets/${DEFAULT_IMAGE_NAME}`));
        }
        const [offerType, offerInstance] = this.parseTokenId(tokenId);
        const image = await this._offerService.getImage(offerType, offerInstance);
        if (!image) {
            throw new OfferNotFoundError(tokenId);
        }
        if (!tokenId.endsWith(this.getImageSuffix(image.format))) {
            throw new OfferTokenIdError("Invalid format for token identifier");
        }
        res.contentType(image.format);
        return new StreamableFile(Buffer.from(image.data.toString('hex'), 'hex'));
    }

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
    async create(@Body() cmd: CreateOfferCommand): Promise<void> {
        const toAddress = await this.getToAddress(cmd);
        await this._offerService.create(toAddress, cmd.offerType, BigInt(cmd.amount), cmd.additionalInfo);
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
    async transfer(@Request() req, @Body() cmd: TransferOfferCommand): Promise<void> {
        const asAdmin = req.user.role === Role.Admin;
        const userId = (asAdmin && cmd.fromUserId) || req.user.id;
        const toAddress = await this.getToAddress(cmd);
        await this._offerService.transfer(userId, toAddress, BigInt(cmd.tokenId), asAdmin);
    }

    @Put("template/:offerType/:offerInstance?")
    @Roles(Role.Admin)
    @ApiOperation({ summary: "Create template for an offer type" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    async createTemplate(
        @Body() cmd: CreateTemplateCommand,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this._offerService.createTemplate(offerType, { ...cmd }, offerInstance);
    }

    @Delete("template/:offerType/:offerInstance?")
    // !!    @Roles(Role.Admin)
    @ApiOperation({ summary: "Delete template for an offer type" })
    async deleteTemplate(
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this._offerService.deleteTemplate(offerType, offerInstance);
    }

    @Put("image/:offerType/:offerInstance?")
    // !!    @Roles(Role.Admin)
    @ApiOperation({ summary: "Add image for an offer type" })
    @ApiResponse({
        status: HttpStatus.CREATED,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
    })
    @UseInterceptors(FileInterceptor('image'))
    async uploadImage(
        @UploadedFile() file: Express.Multer.File,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        const format = this.getImageFormat(file.buffer);
        if (!format) {
            throw new UnsupportedMediaTypeException("Only GIF/JPG/PNG image types are supported");
        }
        await this._offerService.uploadImage(offerType, format, file.buffer, offerInstance);
    }

    @Delete("image/:offerType/:offerInstance?")
    // !!    @Roles(Role.Admin)
    @ApiOperation({ summary: "Delete image for an offer type" })
    async deleteImage(
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this._offerService.deleteImage(offerType, offerInstance);
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

    private parseTokenId(tokenId: string): [number, number] {
        if (tokenId.length > 64) {
            const offerType = Number.parseInt(tokenId.slice(0, 32));
            const offerInstance = Number.parseInt(tokenId.slice(32, 64));
            if (!Number.isNaN(offerType) && !Number.isNaN(offerInstance)) {
                return [offerType, offerInstance];
            }
        }
        throw new OfferTokenIdError("Invalid format for token identifier");
    }

    private getImageSuffix(format: MimeType): string {
        const suffixes = new Map<MimeType, string>([
            [MimeType.GIF, "gif"],
            [MimeType.JPG, "jpg"],
            [MimeType.PNG, "png"],
        ]);
        return suffixes.get(format);
    }

    private getImageFormat(data: Buffer): MimeType {
        const formats: [MimeType, string][] = [
            [MimeType.GIF, "47494638"],
            [MimeType.JPG, "FFD8FF"],
            [MimeType.PNG, "89504E470D0A1A0A"]
        ];
        return formats.find(([_, magic]) => data.toString('hex', 0, magic.length / 2).toUpperCase() === magic)?.[0];
    }
}
