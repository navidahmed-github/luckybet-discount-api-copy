import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderTokens } from "../../providerTokens";
import { Transfer } from "../../entities/transfer.entity";
import { User } from "../../entities/user.entity";
import { UserModule } from "../user/user.module";
import { ContractService } from "../../services/contract.service";
import { WalletService } from "../../services/wallet.service";
import { EthereumProviderService } from "../../services/ethereumProvider.service";
import { TokenService } from "./token.service";
import { TokenController } from "./token.controller";

@Module({
    imports: [TypeOrmModule.forFeature([Transfer, User]), UserModule],
    exports: [ProviderTokens.TokenService],
    controllers: [TokenController],
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
            provide: ProviderTokens.TokenService,
            useClass: TokenService,
        },
    ]
})

export class TokenModule {}
