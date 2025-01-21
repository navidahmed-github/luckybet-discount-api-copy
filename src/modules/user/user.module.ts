import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderTokens } from "../../providerTokens";
import { User } from "../../entities/user.entity";
import { AtomicSequenceService } from "../../services/atomicSequence.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
	imports: [TypeOrmModule.forFeature([User])],
	exports: [ProviderTokens.UserService],
	controllers: [UserController],
	providers: [
		ConfigService,
		{
			provide: ProviderTokens.AtomicSequenceService,
			useClass: AtomicSequenceService,
		},
        {
			provide: ProviderTokens.UserService,
			useClass: UserService,
		},
    ]
})

export class UserModule {}
