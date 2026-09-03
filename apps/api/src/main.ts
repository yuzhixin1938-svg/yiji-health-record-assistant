import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { HttpErrorFilter } from "./common/http-error.filter.js";
import { requestContext } from "./common/request-context.js";
import { requestLogger } from "./common/request-logger.js";
import { loadEnvironment } from "./config/environment.js";

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  const allowedOrigins = new Set(environment.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"), false);
    },
    credentials: false,
  });
  app.use(requestContext, requestLogger);
  app.setGlobalPrefix("v1");
  app.enableShutdownHooks();
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(environment.PORT, environment.HOST);
}

void bootstrap();
