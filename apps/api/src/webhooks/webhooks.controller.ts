import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { RequestWithId } from "../common/request-context.js";
import { ResendWebhookService } from "./resend-webhook.service.js";

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly resendWebhook: ResendWebhookService) {}

  @Post("resend")
  handleResend(@Body() body: unknown, @Req() request: RawBodyRequest) {
    return this.resendWebhook.handle({
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(body ?? {})),
      headers: request.headers,
      body: body as never,
      requestId: (request as RequestWithId).requestId,
    });
  }
}
