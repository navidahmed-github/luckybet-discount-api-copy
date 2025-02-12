import { ApiParam } from "@nestjs/swagger";

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

export const ApiParamUserId = (description: string, required: boolean = false) => ApiParam({
    name: "userId",
    description,
    required,
    type: String,
})
