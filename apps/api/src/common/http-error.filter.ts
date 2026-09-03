import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { RequestWithId } from "./request-context.js";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const isHttpError = exception instanceof HttpException;
    const status = isHttpError ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpError ? this.messageFrom(exception) : "服务暂时不可用";
    const requestId = (request as RequestWithId).requestId;

    if (!isHttpError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "unhandled_exception",
          requestId,
          method: request.method,
          path: request.path,
          message: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    response.status(status).json({
      error: {
        code: isHttpError ? `HTTP_${status}` : "INTERNAL_ERROR",
        message,
      },
      requestId,
    });
  }

  private messageFrom(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === "string") return body;
    if (typeof body === "object" && body && "message" in body) {
      const message = body.message;
      return Array.isArray(message) ? message.join("；") : String(message);
    }
    return exception.message;
  }
}
