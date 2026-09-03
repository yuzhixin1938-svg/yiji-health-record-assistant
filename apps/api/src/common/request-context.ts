import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export type RequestWithId = Request & { requestId: string };

const safeRequestId = /^[a-zA-Z0-9._-]{8,128}$/;

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header("x-request-id");
  const requestId = incoming && safeRequestId.test(incoming) ? incoming : randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
