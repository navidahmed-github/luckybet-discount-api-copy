import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderTokens } from "../../providerTokens";
import { Stake } from "../../entities/stake.entity";
import { DeployedContract } from "../../entities/contract.entity";
import { User } from "../../entities/user.entity";
import { UserModule } from "../user/user.module";
import { ContractService } from "../../services/contract.service";
import { EthereumProviderService } from "../../services/ethereumProvider.service";
import { StakeService } from "./stake.service";
import { StakeController } from "./stake.controller";

@Module({
    imports: [TypeOrmModule.forFeature([User, Stake, DeployedContract]), UserModule],
    exports: [ProviderTokens.StakeService],
    controllers: [StakeController],
    providers: [
        ConfigService,
        {
            provide: ProviderTokens.ContractService,
            useClass: ContractService,
        },
        {
            provide: ProviderTokens.EthereumProviderService,
            useClass: EthereumProviderService,
        },
        {
            provide: ProviderTokens.StakeService,
            useClass: StakeService,
        },
    ]
})

export class StakeModule {}
