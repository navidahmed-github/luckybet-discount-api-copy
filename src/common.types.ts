import { ApiProperty, ApiQuery } from "@nestjs/swagger";

export enum OperationStatus {
    Pending = "Pending",
    Processing = "Processing",
    Complete = "Complete",
    Error = "Error"
}

export enum TransferType {
    Send = 'Send',
    Receive = 'Receive',
    Mint = 'Mint',
    Burn = 'Burn'
}

export enum MimeType {
    GIF = 'image/gif',
    JPG = 'image/jpeg',
    PNG = 'image/png'
}

export interface ISource {
    userId: string;
    asAdmin?: boolean;
}

export interface IDestination {
    userId?: string;
    address?: string;
}

export class DestinationDTO implements IDestination {
    @ApiProperty({
        description: "Identifier of user to transfer to (address should not be set if used)",
        required: false,
        type: String,
    })
    userId?: string;

    @ApiProperty({
        description: "Address of wallet to transfer to (userId should not be set if used)",
        required: false,
        type: String,
    })
    address?: string;
}

export class DestinationErrorDTO extends DestinationDTO {
    @ApiProperty({
        description: "Reason why transfer failed",
        required: true,
        type: String,
    })
    reason: string;
}

export class HistoryDTO {
    @ApiProperty({
        description: "Type of transfer",
        enum: TransferType,
    })
    type: TransferType;

    @ApiProperty({
        description: "Address of wallet that token was transferred to/from",
        type: String,
    })
    otherAddress?: string;

    @ApiProperty({
        description: "Identifier of user that token was transferred to/from",
        type: String,
    })
    otherUser?: string;

    @ApiProperty({
        description: "Timestamp when the transfer occurred",
        type: Number,
    })
    timestamp: number;
}

export const ApiQueryUserId = (description: string, required: boolean = false) => ApiQuery({
    name: "userId",
    description,
    required,
    type: String,
})

export const ApiQueryAddress = (description: string, required: boolean = false) => ApiQuery({
    name: "address",
    description,
    required,
    type: String,
})

export function toAdminString(from: ISource) {
    return from.asAdmin ? `as admin: ${from.asAdmin}` : "";
}

export function formatTokenId(tokenId: bigint) {
    return `0x${tokenId.toString(16)}`
}

export function awaitSeconds(seconds: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), seconds * 1000);
    });
}
