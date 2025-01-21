import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserModule } from "./user/user.module";
import { User } from "../entities/user.entity";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		TypeOrmModule.forRoot({
			type: "mongodb",
			url: process.env.MONGO_CONNECTION_STRING,
			entities: [User],
			retryAttempts: 3,
			retryDelay: 10000,
		}),
		UserModule
	],
})

export class AppModule {}
