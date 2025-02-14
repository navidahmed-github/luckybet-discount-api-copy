import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderTokens } from "../../providerTokens";
import { Transfer } from "../../entities/transfer.entity";
import { Template } from "../../entities/template.entity";
import { OfferImage } from "../../entities/image.entity";
import { User } from "../../entities/user.entity";
import { UserModule } from "../user/user.module";
import { ContractService } from "../../services/contract.service";
import { WalletService } from "../../services/wallet.service";
import { EthereumProviderService } from "../../services/ethereumProvider.service";
import { OfferService } from "./offer.service";
import { OfferController } from "./offer.controller";

@Module({
    imports: [TypeOrmModule.forFeature([User, Transfer, Template, OfferImage]), UserModule],
    exports: [ProviderTokens.OfferService],
    controllers: [OfferController],
    providers: [
        ConfigService,
        {
            provide: ProviderTokens.ContractService,
            useClass: ContractService,
        },
        {
            provide: ProviderTokens.WalletService,
            useClass: WalletService,
        },
        {
            provide: ProviderTokens.EthereumProviderService,
            useClass: EthereumProviderService,
        },
        {
            provide: ProviderTokens.OfferService,
            useClass: OfferService,
        },
    ]
})

export class OfferModule {}
