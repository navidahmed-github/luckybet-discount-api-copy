import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { DestinationDTO, DestinationErrorDTO, IDestination, ISource, OperationStatus, TransferHistoryDTO, TransferSummaryDTO } from "../../common.types";
import { RawTransfer } from "../../entities/transfer.entity";

export class CreateTokenCommand {
    @ApiProperty({
        description: "Destination to transfer discount token to",
        type: () => DestinationDTO,
    })
    to: DestinationDTO;

    @IsNotEmpty()
    @ApiProperty({
        description: "Amount of discount token to transfer",
        type: Number,
    })
    amount: number;
}

export class TransferTokenCommand extends CreateTokenCommand {
    @ApiPropertyOptional({
        description: "Identifier of user to transfer token from (admin only)",
        type: String,
    })
    fromUserId?: string;
}

export class AirdropCommand {
    @IsNotEmpty()
    @ApiProperty({
        description: "Amount of discount token to airdrop to each destination",
        type: Number,
    })
    amount: number;

    @ApiProperty({
        description: "Destinations to airdrop tokens to",
        type: () => DestinationDTO,
        isArray: true
    })
    destinations: DestinationDTO[];
}

export class AirdropDTO {
    @ApiProperty({
        description: "Identifier which can be used to query status",
        type: String,
    })
    requestId: string;

    @ApiProperty({
        description: "Amount of discount token airdropped to each destination",
        type: Number,
    })
    amount: number;

    @ApiProperty({
        description: "Total number of destinations airdropped",
        type: Number,
    })
    destinationCount: number;

    @ApiProperty({
        description: "Current status of airdrop",
        enum: OperationStatus,
    })
    status: OperationStatus;

    @ApiProperty({
        description: "Timestamp when airdrop initiated",
        type: Number,
    })
    timestamp: number;
}

export class AirdropResponseDTO {
    @ApiProperty({
        description: "Identifier which can be used to query status",
        type: String,
    })
    requestId: string;
}

export class AirdropStatusDTO {
    @ApiProperty({
        description: "Current status of airdrop",
        enum: OperationStatus,
    })
    status: OperationStatus;

    @ApiProperty({
        description: "Errors that occurred during airdrop",
        type: () => DestinationErrorDTO,
        isArray: true
    })
    errors?: DestinationErrorDTO[];
}


export class TokenBalanceDTO {
    @ApiProperty({
        description: "Balance for user",
        type: Number
    })
    balance: number;
}

export class TokenSummaryDTO extends TransferSummaryDTO {
    @ApiProperty({
        description: "Current total supply of tokens",
        type: Number,
    })
    totalSupply: number;

    @ApiProperty({
        description: "Total of all amounts associated with mints",
        type: Number,
    })
    totalMinted: number;

    @ApiProperty({
        description: "Total of all amounts associated with burns",
        type: Number,
    })
    totalBurnt: number;
}

export class TokenHistoryDTO extends TransferHistoryDTO {
    @ApiProperty({
        description: "Amount of tokens transferred",
        type: Number,
    })
    amount: number;
}

export class TokenTransferDTO {
    @ApiProperty({
        description: "Address from which tokens transferred",
        type: String,
    })
    fromAddress: string;

    @ApiProperty({
        description: "Address to which tokens transferred",
        type: String,
    })
    toAddress: string;

    @ApiProperty({
        description: "Block number associated with transfer",
        type: String,
    })
    blockNumber: number;

    @ApiProperty({
        description: "Transaction hash associated with transfer",
        type: String,
    })
    txHash: string;

    @ApiProperty({
        description: "Amount of tokens transferred",
        type: Number,
    })
    amount: number;
}

export interface ITokenService {
    getSummary(): Promise<TokenSummaryDTO>;
    getBalance(dest: IDestination): Promise<bigint>;
    getHistory(dest: IDestination): Promise<TokenHistoryDTO[]>;
    create(to: IDestination, amount: bigint): Promise<RawTransfer>;
    destroy(amount: bigint): Promise<void>;
    transfer(from: ISource, to: IDestination, amount: bigint): Promise<RawTransfer>;
    airdropGetAll(): Promise<AirdropDTO[]>;
    airdrop(destinations: IDestination[], amount: bigint): Promise<string>;
    airdropStatus(requestId: string): Promise<AirdropStatusDTO>;
}
