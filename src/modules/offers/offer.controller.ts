import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, Post, Put, Query, Request, Res, StreamableFile, UnsupportedMediaTypeException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiUnsupportedMediaTypeResponse } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { createReadStream } from "fs";
import { ProviderTokens } from "../../providerTokens";
import { MimeType } from "../../common.types";
import { DestinationInvalidError, OfferNotFoundError, OfferTokenIdError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { RawTransfer } from "../../entities/transfer.entity";
import { IUserService } from "../user/user.types";
import { CreateTemplateCommand, CreateOfferCommand, IOfferService, OfferHistoryDTO, TransferOfferCommand } from "./offer.types";

const DEFAULT_IMAGE_NAME = "LuckyBetOffer.png";
const DEFAULT_IMAGE_TYPE = MimeType.PNG;

const ApiParamUserId = (description: string, required: boolean = false) => ApiParam({
    name: "userId",
    description,
    required,
    type: String,
})

const ApiParamTokenId = (description: string) => ApiParam({
    name: "tokenId",
    description,
    required: true,
    type: String,
})

const ApiParamOfferType = () => ApiParam({
    name: "offerType",
    description: "Type of offer",
    required: true,
    type: Number,
});

const ApiParamOfferInstance = () => ApiParam({
    name: "offerInstance",
    description: "Instance of offer",
    required: false,
    type: Number,
});

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
    @ApiParamTokenId("Identifier of offer for which to return metadata")
    @ApiQuery({
        name: "detailed",
        description: "Indicates whether to return additional information about token",
        required: false
    })
    @ApiOkResponse({ description: "The metadata was returned successfully" })
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
    @ApiParamTokenId("Identifier of offer for which to return image")
    @ApiOkResponse({ description: "The image was returned successfully" })
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
    @ApiParamUserId("Identifier of user for which to return offer (admin role only)")
    @ApiOkResponse({ description: "The offers were returned successfully" })
    async owned(@Request() req, @Param("userId") userId?: string): Promise<string[]> {
        return this._offerService.getOffers(req.user.role === Role.Admin ? userId : req.user.id);
    }

    @Get("history/:userId?")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiParamUserId("Identifier of user for which to return history (admin role only)")
    @ApiOkResponse({ description: "The history was returned successfully" })
    async history(@Request() req, @Param("userId") userId?: string): Promise<OfferHistoryDTO[]> {
        return this._offerService.getHistory(req.user.role === Role.Admin ? userId : req.user.id);
    }

    @Post(":offerType")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Create an offer" })
    @ApiParamOfferType()
    @ApiOkResponse({ description: "The offer was created successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    async create(
        @Request() req,
        @Body() cmd: CreateOfferCommand,
        @Param("offerType", new ParseIntPipe()) offerType: number,
    ): Promise<RawTransfer> {
        await this.checkPartnerPermission(offerType, req);
        const toAddress = await this.getToAddress(cmd);
        return this._offerService.create(toAddress, offerType, BigInt(cmd.amount), cmd.additionalInfo); // !! check
    }

    @Post("transfer")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Transfer offers to another user" })
    @ApiOkResponse({ description: "The offer was transferred successfully" })
    async transfer(@Request() req, @Body() cmd: TransferOfferCommand): Promise<RawTransfer> {
        const asAdmin = req.user.role === Role.Admin;
        const userId = (asAdmin && cmd.fromUserId) || req.user.id;
        const toAddress = await this.getToAddress(cmd);
        return this._offerService.transfer(userId, toAddress, BigInt(cmd.tokenId), asAdmin);
    }

    // !! activate offer

    @Put("template/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Create/update template for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiOkResponse({ description: "The template was created/updated successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    async createTemplate(
        @Request() req,
        @Body() cmd: CreateTemplateCommand,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        await this._offerService.createTemplate(offerType, { ...cmd }, offerInstance);
    }

    @Delete("template/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Delete template for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiNoContentResponse({ description: "The template was deleted successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteTemplate(
        @Request() req,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        await this._offerService.deleteTemplate(offerType, offerInstance);
    }

    @Put("image/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Add/update image for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiOkResponse({ description: "The image was added/updated successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @ApiUnsupportedMediaTypeResponse({ description: "The image type is not supported" })
    @UseInterceptors(FileInterceptor('image'))
    async uploadImage(
        @Request() req,
        @UploadedFile() file: Express.Multer.File,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        const format = this.getImageFormat(file.buffer);
        if (!format) {
            throw new UnsupportedMediaTypeException("Only GIF/JPG/PNG image types are supported");
        }
        await this._offerService.uploadImage(offerType, format, file.buffer, offerInstance);
    }

    @Delete("image/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Delete image for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiNoContentResponse({ description: "The image was deleted successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteImage(
        @Request() req,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        await this._offerService.deleteImage(offerType, offerInstance);
    }

    private async checkPartnerPermission(offerType: number, req) {
        if (req.user.role !== Role.Admin && !(await this._offerService.isOwner(offerType, req.user.partner))) {
            throw new ForbiddenException("Partner does not own this offer type");
        }
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
