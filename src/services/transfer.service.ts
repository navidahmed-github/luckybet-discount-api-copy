import { Inject, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MongoRepository } from "typeorm";
import { MongoBulkWriteError } from "mongodb";
import { Contract, JsonRpcApiProvider, Log, Wallet, ZeroAddress } from "ethers";
import { ProviderTokens } from "../providerTokens";
import { HistoryDTO, IDestination, TransferType } from "../common.types";
import { DestinationInvalidError, MONGO_DUPLICATE_KEY } from "../error.types";
import { RawTransfer, Transfer } from "../entities/transfer.entity";
import { User } from "../entities/user.entity";
import { IContractService } from "../services/contract.service";
import { IProviderService } from "../services/ethereumProvider.service";
import { IUserService } from "../modules/user/user.types";

export class TransferService<T extends HistoryDTO> implements OnModuleInit, OnModuleDestroy {
    protected readonly _provider: JsonRpcApiProvider;
    protected readonly _userTableName: string;
    protected _disableListener: boolean;
    protected _event: Contract;

    @Inject(ProviderTokens.UserService)
    protected readonly _userService: IUserService;

    @Inject(ProviderTokens.ContractService)
    protected readonly _contractService: IContractService;

    @InjectRepository(Transfer)
    protected readonly _transferRepository: MongoRepository<Transfer>;

    constructor(
        protected readonly _logger: Logger,
        ethereumProviderService: IProviderService,
        userRepository: MongoRepository<User>
    ) {
        this._userTableName = userRepository.metadata.tableName;
        this._provider = ethereumProviderService.getProvider();
    }

    public async onModuleInit() {
        this._disableListener = false;
        this._event = await this.getContract();
        const currentBlock = await this._provider.getBlockNumber();
        const evts = await this._event.queryFilter("Transfer", Math.max(currentBlock - 10000, 0), currentBlock);
        Promise.allSettled(evts.filter(evt => "args" in evt).map(async (evt) =>
            this.saveTransfer(evt.args[0], evt.args[1], evt.args[2], evt.blockNumber, evt.transactionHash)));
        this._event.on("Transfer", this.transferListener);
    }

    public async onModuleDestroy() {
        this._event?.off("Transfer", this.transferListener);
    }

    public async getHistory(dest: IDestination, name: string, toDtoData: (t: Transfer) => Omit<T, "type" | "timestamp">): Promise<T[]> {
        const [address] = await this.parseDestination(dest);
        this._logger.verbose(`Retrieving ${name} history for address: ${address}`);
        const lookupPipeline = (prefix: string) => {
            return {
                $lookup: {
                    from: this._userTableName,
                    localField: `${prefix}Address`,
                    foreignField: "address",
                    as: `${prefix}User`
                }
            }
        };
        const existsClause = {};
        existsClause[name] = { $exists: true };
        const transfers = this._transferRepository.aggregate([
            {
                $match: {
                    $and: [
                        existsClause,
                        { $or: [{ fromAddress: address }, { toAddress: address }] }
                    ]
                }
            },
            lookupPipeline("from"),
            lookupPipeline("to"),
            { $sort: { blockTimestamp: 1 } }
        ]);
        return (await transfers.toArray()).map(toHistory).filter(Boolean);

        function toHistory(transfer: Transfer & { fromUser: User[], toUser: User[] }): T | null {
            let dto = null;
            if (transfer.toAddress == address) {
                const otherUser = transfer.fromUser.length ? { otherUser: transfer.fromUser[0].userId } : {};
                dto = (transfer.fromAddress == ZeroAddress) ?
                    { type: TransferType.Mint } :
                    { type: TransferType.Receive, otherAddress: transfer.fromAddress, ...otherUser };
            }
            if (transfer.fromAddress == address) {
                const otherUser = transfer.toUser.length ? { otherUser: transfer.toUser[0].userId } : {};
                dto = (transfer.toAddress == ZeroAddress) ?
                    { type: TransferType.Burn } :
                    { type: TransferType.Send, otherAddress: transfer.toAddress, ...otherUser };
            }
            if (!dto) {
                this._logger.error(`Failed to parse history record with txHash: ${transfer.txHash}`);
                return null;
            }
            const data = toDtoData(transfer);
            return { ...dto, ...data, timestamp: transfer.blockTimestamp };
        }
    }

    protected async parseDestination(to: IDestination): Promise<[string, Wallet?]> {
        if (to.userId) {
            if (to.address)
                throw new DestinationInvalidError("Cannot provide both user and address as destination");
            const wallet = await this._userService.getUserWallet(to.userId);
            return [wallet.address, wallet];
        }
        if (!to.address)
            throw new DestinationInvalidError("No destination provided");
        return [to.address, null];
    }

    protected async getContract(): Promise<Contract> {
        throw new Error("getContract() must be overriden");
    }

    protected addTransferData(_transfer: Omit<RawTransfer, "token" | "offer">, _value: bigint, _args: any[]): RawTransfer {
        throw new Error("addTransferData() must be overriden");
    }

    protected async lockTransfer<T>(fn: () => Promise<T>): Promise<T> {
        try {
            this._disableListener = true;
            return await fn();
        } finally {
            this._disableListener = false;
        }
    }

    protected async saveTransfer(
        fromAddress: string,
        toAddress: string,
        value: bigint,
        blockNumber: number,
        txHash: string,
        ...args: any[]
    ): Promise<RawTransfer> {
        const transfer = this.addTransferData({ fromAddress, toAddress, blockNumber, txHash }, value, args);
        try {
            if (!await this._transferRepository.findOne({ where: { txHash } })) {
                const blockTimestamp = (await this._provider.getBlock(blockNumber)).timestamp;
                return await this._transferRepository.save({ ...transfer, blockTimestamp });
            }
        } catch (err) {
            if (!(err instanceof MongoBulkWriteError && err.code == MONGO_DUPLICATE_KEY)) // ignore if already exists
                this._logger.error(`Failed to write transfer with txHash: ${txHash}, reason: ${err.messsage}`, err.stack);
        }
        return transfer;
    }

    private transferListener = async (from: string, to: string, value: bigint, { log }: { log: Log }) => {
        if (!this._disableListener) {
            await this.saveTransfer(from, to, value, log.blockNumber, log.transactionHash);
        }
    }
}
