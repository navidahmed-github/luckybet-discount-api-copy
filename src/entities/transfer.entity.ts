import { Column, CreateDateColumn, Entity, Index, ObjectId, ObjectIdColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity()
export class TokenTransfer {
    @Column()
    amount: string; // can't store bigint in MongoDB natively
}

@Entity()
export class OfferTransfer {
    @Column()
    offerType: number;

    @Column()
    offerInstance: number;

    @Column()
    amount?: string;

    @Column()
    additionalInfo?: string;
}

@Entity("transfers")
// multiple mints via mintMany() can occur in the same transaction for a token so txHash is not necessarily unique
@Index(["txHash", "toAddress"], { unique: true })
export class Transfer {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    @Index()
    fromAddress: string;

    @Column()
    @Index()
    toAddress: string;

    @Column()
    blockNumber: number;

    @Column()
    @Index()
    blockTimestamp: number;

    @Column()
    txHash: string;

    @Column(() => TokenTransfer)
    token?: TokenTransfer;

    @Column(() => OfferTransfer)
    offer?: OfferTransfer;

    @Column()
    @CreateDateColumn()
    createdAt: Date;

    @Column()
    @UpdateDateColumn()
    updatedAt: Date;
}

export type RawTransfer = Omit<Transfer, "id" | "blockTimestamp" | "createdAt" | "updatedAt">;

export type RawTransferWithTokenId = RawTransfer & { offer: { tokenId: string } };