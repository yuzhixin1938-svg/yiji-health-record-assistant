import { Controller, Get, HttpCode, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService, type ReadinessResponse } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @HttpCode(200)
  async readiness(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const readiness = await this.healthService.readiness();
    if (readiness.status !== "ok") response.status(503);
    return readiness;
  }
}
