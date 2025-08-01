import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, HttpStatus, Inject, Param, ParseBoolPipe, ParseIntPipe, Post, Put, Query, Request, Res, StreamableFile, UnsupportedMediaTypeException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiUnsupportedMediaTypeResponse } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { createReadStream } from "fs";
import { ProviderTokens } from "../../providerTokens";
import { ApiQueryAddress, ApiQueryUserId, fromTokenNative, MimeType, toTokenNative } from "../../common.types";
import { OfferNotFoundError, OfferTokenIdError, UserMissingIdError } from "../../error.types";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { RawTransferWithTokenId } from "../../entities/transfer.entity";
import { Template } from "../../entities/template.entity";
import { CreateTemplateCommand, CreateOfferCommand, IOfferService, OfferHistoryDTO, TransferOfferCommand, TemplateDTO, MetadataDetails, OfferDTO, ImageDTO, TransformedMetadata, NextOfferDTO, OfferSummaryDTO, OfferTransferDTO } from "./offer.types";

const DEFAULT_IMAGE_NAME = "LuckyBetOffer.png";
const DEFAULT_IMAGE_TYPE = MimeType.PNG;

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
    description: "Instance of offer (empty or zero to use as default for type)",
    required: false,
    type: Number,
});

@Controller("offers")
@ApiBearerAuth()
export class OfferController {
    constructor(
        @Inject(ProviderTokens.OfferService)
        private _offerService: IOfferService,
    ) { }

    @Get("summary")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get offer summary details" })
    @ApiOkResponse({
        description: "Summary was returned successfully",
        type: OfferSummaryDTO
    })
    async summary(): Promise<OfferSummaryDTO> {
        return this._offerService.getSummary();
    }

    @Get("owned")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get offers owned for user" })
    @ApiQueryUserId("Identifier of user for which to return offers (admin role only)")
    @ApiQueryAddress("Address for which to return offers (admin role only)")
    @ApiQuery({
        name: "shortId",
        description: "Indicates whether to remove zero padding",
        required: false,
        type: Boolean,
    })
    @ApiOkResponse({
        description: "Offers were returned successfully",
        type: OfferDTO,
        isArray: true
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    @ApiInternalServerErrorResponse({ description: "Failed to read contract" })
    async owned(
        @Request() req,
        @Query("userId") userId?: string,
        @Query("address") address?: string,
        @Query("shortId", new ParseBoolPipe({ optional: true })) shortId?: boolean
    ): Promise<OfferDTO[]> {
        const dest = req.user.role === Role.Admin ? { userId, address } : { userId: req.user.id };
        return this._offerService.getOffers(dest, shortId);
    }

    @Get("history")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Get history for user" })
    @ApiQueryUserId("Identifier of user for which to return history (admin role only)")
    @ApiQueryAddress("Address for which to return history (admin role only)")
    @ApiOkResponse({
        description: "History was returned successfully",
        type: OfferHistoryDTO,
        isArray: true
    })
    @ApiNotFoundResponse({ description: "User could not be found" })
    async history(@Request() req, @Query("userId") userId?: string, @Query("address") address?: string): Promise<OfferHistoryDTO[]> {
        const dest = req.user.role === Role.Admin ? { userId, address } : { userId: req.user.id };
        return this._offerService.getHistory(dest);
    }

    @Post(":offerType")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Create an offer" })
    @ApiParamOfferType()
    @ApiOkResponse({
        description: "The offer was created successfully",
        type: OfferTransferDTO
    })
    @ApiBadRequestResponse({ description: "Invalid destination format" })
    @ApiInternalServerErrorResponse({ description: "Failed to create offer type" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    async create(
        @Request() req,
        @Body() cmd: CreateOfferCommand,
        @Param("offerType", new ParseIntPipe()) offerType: number,
    ): Promise<OfferTransferDTO> {
        await this.checkPartnerPermission(offerType, req);
        return this.toTransferDTO(await this._offerService.create(cmd.to, offerType, toTokenNative(cmd.amount), cmd.additionalInfo));
    }

    @Post(":tokenId/transfer")
    @Roles(Role.Admin, Role.User)
    @ApiOperation({ summary: "Transfer offers to another user" })
    @ApiParamTokenId("Identifier of offer to transfer")
    @ApiOkResponse({
        description: "The offer was transferred successfully",
        type: OfferTransferDTO
    })
    @ApiBadRequestResponse({ description: "Invalid destination format or not owner" })
    @ApiInternalServerErrorResponse({ description: "Failed to transfer offer" })
    async transfer(@Request() req, @Body() cmd: TransferOfferCommand, @Param("tokenId") tokenId: string): Promise<OfferTransferDTO> {
        const asAdmin = req.user.role === Role.Admin ? req.user.id : undefined;
        const userId = asAdmin ? cmd.fromUserId : req.user.id;
        if (!userId) {
            throw new UserMissingIdError();
        }
        return this.toTransferDTO(await this._offerService.transfer({ userId, asAdmin }, cmd.to, BigInt(tokenId)));
    }

    @Post(":tokenId/activate")
    @Roles(Role.User)
    @ApiOperation({ summary: "Mark offer as activated" })
    @ApiParamTokenId("Identifier of offer to activate")
    @ApiOkResponse({ description: "The offer was activated successfully" })
    @ApiBadRequestResponse({ description: "Not owner" })
    @ApiInternalServerErrorResponse({ description: "Failed to activate offer" })
    async activate(@Request() req, @Param("tokenId") tokenId: string): Promise<void> {
        await this._offerService.activate(req.user.id, BigInt(tokenId));
    }

    @Get("template")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Get all templates" })
    @ApiOkResponse({
        description: "Templates were returned successfully",
        type: TemplateDTO,
        isArray: true,
    })
    async getTemplates(): Promise<TemplateDTO[]> {
        return this._offerService.getTemplates().then(o => o.map(this.toTemplateDTO));
    }

    @Get("template/next")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Get next unused offer type" })
    @ApiOkResponse({
        description: "Next offer type was returned successfully",
        type: NextOfferDTO,
    })
    async getTemplateNextOfferType(@Request() req): Promise<NextOfferDTO> {
        const nextOfferType = await this._offerService.getNextOfferType(req.user.partner);
        return { nextOfferType };
    }

    @Put("template/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Create/update template for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiOkResponse({ description: "The template was created/updated successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @ApiInternalServerErrorResponse({ description: "Failed to create/update template" })
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
    @ApiInternalServerErrorResponse({ description: "Failed to delete template" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteTemplate(
        @Request() req,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        await this._offerService.deleteTemplate(offerType, offerInstance);
    }

    @Get("template-image/:offerType/:offerInstance?")
    @ApiOperation({ summary: "Get image for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiOkResponse({
        description: "The image was returned successfully",
        type: ImageDTO
    })
    async imgTemplate(
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<ImageDTO> {
        // this is less efficient than the streamable file used for the standard image retrieval but is simpler
        // and only used on the portal anyway 
        const image = await this._offerService.getImage(offerType, offerInstance);
        return image ? { dataUrl: `data:${image.format};base64,${image.data.toString('base64')}` } : {};
    }

    @Put("template-image/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Add/update image for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiOkResponse({ description: "The image was added/updated successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @ApiUnsupportedMediaTypeResponse({ description: "The image type is not supported" })
    @ApiInternalServerErrorResponse({ description: "Failed to add/update image" })
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

    @Delete("template-image/:offerType/:offerInstance?")
    @Roles(Role.Admin, Role.Partner)
    @ApiOperation({ summary: "Delete image for an offer type/instance" })
    @ApiParamOfferType()
    @ApiParamOfferInstance()
    @ApiNoContentResponse({ description: "The image was deleted successfully" })
    @ApiForbiddenResponse({ description: "Partner does not own this offer type" })
    @ApiInternalServerErrorResponse({ description: "Failed to delete image" })
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteImage(
        @Request() req,
        @Param("offerType", new ParseIntPipe()) offerType: number,
        @Param("offerInstance", new ParseIntPipe({ optional: true })) offerInstance?: number
    ): Promise<void> {
        await this.checkPartnerPermission(offerType, req);
        await this._offerService.deleteImage(offerType, offerInstance);
    }

    // DO NOT reorder this method, it should always be last so the more specific overrides above take precedence
    @Get(":tokenId")
    @ApiOperation({ summary: "Get metadata associated with token identifier" })
    @ApiParamTokenId("Identifier of offer for which to return metadata")
    @ApiQuery({
        name: "detailed",
        description: "Indicates whether to return additional information about token",
        required: false,
        type: Boolean
    })
    @ApiOkResponse({ description: "Metadata was returned successfully" })
    @ApiNotFoundResponse({ description: "Metadata does not exist" })
    @ApiBadRequestResponse({ description: "Invalid format for token identifier" })
    async metadata(
        @Param("tokenId") tokenId: string,
        @Query("detailed", new ParseBoolPipe({ optional: true })) detailed?: boolean
    ): Promise<TransformedMetadata & MetadataDetails & { image: string }> {
        if (tokenId.length != 64) {
            throw new OfferTokenIdError("Invalid format for token identifier");
        }
        const [offerType, offerInstance] = this.parseTokenId(tokenId);
        const metadata = await this._offerService.getMetadata(offerType, offerInstance, detailed);
        if (!metadata) {
            throw new OfferNotFoundError(tokenId);
        }
        const image = await this._offerService.getImage(offerType, offerInstance);
        const imagePath = image ? `${tokenId}.${this.getImageSuffix(image.format)}` : DEFAULT_IMAGE_NAME;
        return { ...metadata, image: process.env.SERVER_URL + "/offers/image/" + imagePath };
    }

    @Get("image/:tokenId")
    @ApiOperation({ summary: "Get image associated with token identifier" })
    @ApiParamTokenId("Identifier of offer for which to return image")
    @ApiOkResponse({ description: "The image was returned successfully" })
    @ApiNotFoundResponse({ description: "Image does not exist" })
    @ApiBadRequestResponse({ description: "Invalid format for token identifier" })
    @Header('Content-Disposition', 'inline')
    async img(@Param("tokenId") tokenId: string, @Res({ passthrough: true }) res): Promise<StreamableFile> {
        if (tokenId === DEFAULT_IMAGE_NAME) {
            res.contentType(DEFAULT_IMAGE_TYPE);
            return new StreamableFile(createReadStream(`assets/${DEFAULT_IMAGE_NAME}`));
        }
        if (tokenId.indexOf(".") != 64) {
            throw new OfferTokenIdError("Invalid format for token identifier");
        }
        const [offerType, offerInstance] = this.parseTokenId(tokenId);
        const image = await this._offerService.getImage(offerType, offerInstance);
        if (!image) {
            throw new OfferNotFoundError(tokenId);
        }
        if (!tokenId.endsWith(this.getImageSuffix(image.format))) {
            throw new OfferTokenIdError("Incorrect image type for token identifier");
        }
        res.contentType(image.format);
        return new StreamableFile(Buffer.from(image.data.toString('hex'), 'hex'));
    }

    private async checkPartnerPermission(offerType: number, req) {
        if (req.user.role !== Role.Admin && !(await this._offerService.isOwner(offerType, req.user.partner))) {
            throw new ForbiddenException("Partner does not own this offer type");
        }
    }

    private parseTokenId(tokenId: string): [number, number] {
        const offerType = Number.parseInt(tokenId.slice(0, 32), 16);
        const offerInstance = Number.parseInt(tokenId.slice(32, 64), 16);
        if (!Number.isNaN(offerType) && !Number.isNaN(offerInstance)) {
            return [offerType, offerInstance];
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

    private toTemplateDTO(template: Template): TemplateDTO {
        return {
            offerType: template.offerType,
            offerInstance: template.offerInstance,
            name: template.metadata.name,
            description: template.metadata.description,
            attributes: template.metadata.attributes
        };
    }

    private toTransferDTO(transfer: RawTransferWithTokenId): OfferTransferDTO {
        const { offer, ...rest } = transfer;
        return { ...rest, ...offer, ...(offer.amount && { amount: fromTokenNative(BigInt(offer.amount)) }) };
    }
}
