import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CreateMetricDto } from "./metrics.dto.js";
import { MetricsService } from "./metrics.service.js";

@UseGuards(AuthGuard)
@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("memberId") memberId?: string,
    @Query("metricType") metricType?: string,
  ) {
    return this.metrics.list(request.user.id, memberId, metricType);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateMetricDto) {
    const metric = await this.metrics.create(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: metric.memberId,
      action: "metric.create",
      resourceType: "metric_record",
      resourceId: metric.id,
      requestId: request.requestId,
      metadata: { metricType: metric.metricType, sourceType: metric.sourceType },
    });
    return metric;
  }

  @Get("trends")
  async trends(
    @Req() request: AuthenticatedRequest,
    @Query("memberId") memberId?: string,
    @Query("metricType") metricType?: string,
  ) {
    return this.metrics.trends(request.user.id, memberId, metricType);
  }
}
