import { ApiProperty, ApiQuery } from "@nestjs/swagger";
import { Contract, isAddress, Wallet } from "ethers";
import { ContractError, ContractNonceError, DestinationInvalidError } from "./error.types";
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

export class TransferSummaryDTO {
    @ApiProperty({
        description: "Total count of all mints that have occurred",
        type: Number,
    })
    totalMints: number;

    @ApiProperty({
        description: "Total count of all burns that have occurred",
        type: Number,
    })
    totalBurns: number;

    @ApiProperty({
        description: "Total count of all transfers that have occurred",
        type: Number,
    })
    totalTransfers: number;

    @ApiProperty({
        description: "Total unique holders (those which have had transfers to/from them)",
        type: Number,
    })
    uniqueHolders: number;
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

export function formatTokenId(tokenId: bigint, shortId?: boolean) {
    return shortId ? `0x${tokenId.toString(16)}` : `0x${tokenId.toString(16).padStart(64, '0')}`;
}

export function getTokenId(offerType: number, offerInstance: number): bigint {
    return (BigInt(offerType) << 128n) + BigInt(offerInstance);
}

export function splitTokenId(tokenId: bigint): { offerType: number, offerInstance: number } {
    return { offerType: Number(tokenId >> 128n), offerInstance: Number(tokenId & ((1n << 128n) - 1n)) };
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

export function extractCustomSolidityError(error: any, contractInterface: any): string | undefined {
    if (error?.data) {
        try {
            return contractInterface.parseError(error.data)?.name;
        } catch (err) {
            return err.toString();
        }
    }
    return undefined;
}

export async function callContract<T>(action: () => Promise<T>, contract: Contract) {
    try {
        return await action();
    } catch (err) {
        const customError = extractCustomSolidityError(err, contract.interface);
        if (customError) {
            throw new ContractError(customError);
        }
        if (err?.code === "NONCE_EXPIRED") {
            throw new ContractNonceError(err?.info?.error?.message);
        }
        throw err;
    }
}

export async function awaitSeconds(seconds: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), seconds * 1000);
    });
}
