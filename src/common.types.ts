import { ApiProperty, ApiQuery } from "@nestjs/swagger";
import { isAddress, Wallet } from "ethers";
import { DestinationInvalidError } from "./error.types";
import { IUserService } from "./modules/user/user.types";

export enum OperationStatus {
    Pending = 'Pending',
    Processing = 'Processing',
    Complete = 'Complete',
    Error = 'Error'
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

export class TransferHistoryDTO {
    @ApiProperty({
        description: "Type of record",
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
        description: "Transaction hash associated with transfer",
        type: String,
    })
    txHash: string;

    @ApiProperty({
        description: "Timestamp when the event occurred",
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

const TOKEN_DECIMALS = 0n;

export function toTokenNative(amount: number): bigint {
    return fromNumberSafe(amount * Number(10n ** TOKEN_DECIMALS));
}

export function fromTokenNative(amount: bigint): number {
    return toNumberSafe(amount / (10n ** TOKEN_DECIMALS));
}

export function fromNumberSafe(value: number): bigint {
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
        throw new Error("Number cannot be safely converted to big integer");
    }
    return BigInt(Math.trunc(value));
}

export function toNumberSafe(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error("Big integer cannot be safely converted to number");
    }
    return Number(value);
}

export function toAdminString(from: ISource) {
    return from.asAdmin ? `as admin: ${from.asAdmin}` : "";
}

export function formatTokenId(tokenId: bigint) {
    return `0x${tokenId.toString(16)}`
}

export async function awaitSeconds(seconds: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), seconds * 1000);
    });
}

export async function parseDestination(userService: IUserService, to: IDestination): Promise<[string, Wallet?]> {
    if (to.userId) {
        if (to.address)
            throw new DestinationInvalidError("Cannot provide both user and address as destination");
        const wallet = await userService.getUserWallet(to.userId);
        return [wallet.address, wallet];
    }
    if (!to.address)
        throw new DestinationInvalidError("No destination provided");
    if (!isAddress(to.address))
        throw new DestinationInvalidError(`Not a valid Ethereum address: ${to.address}`);
    return [to.address, null];
}
