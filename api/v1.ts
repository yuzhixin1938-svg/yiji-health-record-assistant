import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "../apps/api/src/app.module.js";
import { HttpErrorFilter } from "../apps/api/src/common/http-error.filter.js";
import { requestContext } from "../apps/api/src/common/request-context.js";
import { requestLogger } from "../apps/api/src/common/request-logger.js";

type VercelLikeRequest = express.Request & {
  query: {
    path?: string | string[];
  };
};

let server: express.Express | null = null;

async function getServer() {
  if (server) return server;

  const expressServer = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressServer), {
    bufferLogs: true,
  });

  app.enableCors({ origin: true, credentials: false });
  app.use(requestContext, requestLogger);
  app.setGlobalPrefix("v1");
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  server = expressServer;
  return server;
}

export default async function handler(request: VercelLikeRequest, response: express.Response) {
  const rawPath = Array.isArray(request.query.path) ? request.query.path[0] : request.query.path;
  const path = rawPath ? String(rawPath).replace(/^\/+/, "") : "";
  const originalUrl = new URL(request.url ?? "/api/v1", "https://yiji.local");
  originalUrl.searchParams.delete("path");
  const search = originalUrl.searchParams.toString();
  request.url = `/v1/${path}${search ? `?${search}` : ""}`;

  const app = await getServer();
  return app(request, response);
}
