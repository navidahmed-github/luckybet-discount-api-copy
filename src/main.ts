import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import { AppModule } from "./modules/app.module";
dotenv.config();

const logger = new Logger("API");
const PORT = process.env.PORT || 3005;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  app.useGlobalPipes(new ValidationPipe());
  // !!	app.useGlobalInterceptors(new GenericInterceptor());
  // !! app.use(cookieParser(process.env.JWT_SECRET));
  app.enableShutdownHooks();

  // Enable swagger at "/swagger/" only if it's allowed in this environment
  if (process.env.ENABLE_SWAGGER === "true") {
    const options = new DocumentBuilder()
      .setTitle("Lucky Bet Discount API")
      .setDescription("REST API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, options);

    SwaggerModule.setup("swagger", app, document);
  }

  await app.listen(PORT);
}

bootstrap().then(() => {
  logger.log(`Ready to accept connections on port ${PORT}`);
}).catch(err => {
  logger.error(err);
  logger.debug(err.stack);
});
