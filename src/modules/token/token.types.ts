import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { DestinationDTO, DestinationErrorDTO, IDestination, ISource, OperationStatus, TransferHistoryDTO } from "../../common.types";
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

export class AirdropResponseDTO {
    @ApiProperty({
        description: "Identifier which can be used to query status",
        type: Number,
    })
    requestId: string;
}

export class AirdropStatusDTO {
    status: OperationStatus;

    errors?: DestinationErrorDTO[];
}


export class TokenBalanceDTO {
    @ApiProperty({
        description: "Balance for user",
        type: Number
    })
    balance: number;
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
    getBalance(dest: IDestination): Promise<bigint>;
    getHistory(dest: IDestination): Promise<TokenHistoryDTO[]>;
    create(to: IDestination, amount: bigint): Promise<RawTransfer>;
    destroy(amount: bigint): Promise<void>;
    transfer(from: ISource, to: IDestination, amount: bigint): Promise<RawTransfer>;
    airdrop(destinations: IDestination[], amount: bigint): Promise<string>;
    airdropStatus(requestId: string): Promise<AirdropStatusDTO>;
}
