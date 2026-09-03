import type { NextFunction, Request, Response } from "express";
import type { RequestWithId } from "./request-context.js";

type LogEvent = {
  level: "info" | "error";
  event: "http_request";
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

export function requestLogger(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();

  response.on("finish", () => {
    const event: LogEvent = {
      level: response.statusCode >= 500 ? "error" : "info",
      event: "http_request",
      requestId: (request as RequestWithId).requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    };

    // Never log headers, cookies, query values, request bodies, or response bodies here.
    process.stdout.write(`${JSON.stringify(event)}\n`);
  });

  next();
}
