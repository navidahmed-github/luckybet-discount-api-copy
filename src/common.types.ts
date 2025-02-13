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
