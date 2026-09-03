import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { RequestWithId } from "../common/request-context.js";
import { ClientErrorDto } from "./monitoring.dto.js";
import { MonitoringService } from "./monitoring.service.js";

@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Post("client-error")
  recordClientError(@Body() body: ClientErrorDto, @Req() request: Request) {
    const input: {
      requestId: string;
      type: string;
      message?: string;
      page?: string;
      userAction?: string;
    } = {
      requestId: (request as RequestWithId).requestId,
      type: body.type,
    };
    if (body.message !== undefined) input.message = body.message;
    if (body.page !== undefined) input.page = body.page;
    if (body.userAction !== undefined) input.userAction = body.userAction;
    return this.monitoring.recordClientError(input);
  }
}
