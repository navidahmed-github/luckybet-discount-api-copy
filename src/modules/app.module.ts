import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { RolesGuard } from "../auth/roles.guard";
import { UserModule } from "./user/user.module";
import { TokenModule } from "./token/token.module";
import { OfferModule } from "./offer/offer.module";
import { StakeModule } from "./stake/stake.module";
import { User } from "../entities/user.entity";
import { Transfer } from "../entities/transfer.entity";
import { Template } from "../entities/template.entity";
import { AirdropChunk } from "../entities/airdrop.entity";
import { OfferImage } from "../entities/image.entity";
import { Stake } from "../entities/stake.entity";
import { DeployedContract } from "../entities/contract.entity";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		TypeOrmModule.forRoot({
			type: "mongodb",
			url: process.env.MONGO_CONNECTION_STRING,
			entities: [User, Transfer, Template, OfferImage, AirdropChunk, Stake, DeployedContract],
			retryAttempts: 3,
			retryDelay: 10000,
			synchronize: true
		}),
		JwtModule.register({
			global: true,
			secret: process.env.JWT_SECRET,
			verifyOptions: { ignoreExpiration: false }
		}),
		UserModule,
		TokenModule,
		OfferModule,
		StakeModule
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: RolesGuard,
		},
	],
})

export class AppModule { }
