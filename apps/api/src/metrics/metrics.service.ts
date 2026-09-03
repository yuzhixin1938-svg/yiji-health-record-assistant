import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MemberAccessService } from "../permissions/member-access.service.js";
import type { CreateMetricDto } from "./metrics.dto.js";

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async list(userId: string, memberId?: string, metricType?: string) {
    const resolvedMemberId = await this.access.resolveMemberId(userId, memberId);
    await this.access.assertCan(userId, resolvedMemberId, "record.read");
    return this.prisma.metricRecord.findMany({
      where: {
        memberId: resolvedMemberId,
        ...(metricType ? { metricType } : {}),
      },
      orderBy: { measuredAt: "desc" },
    });
  }

  async create(userId: string, body: CreateMetricDto) {
    const memberId = await this.access.resolveMemberId(userId, body.memberId);
    await this.access.assertCan(userId, memberId, "record.create");
    return this.prisma.metricRecord.create({
      data: {
        memberId,
        createdById: userId,
        metricType: body.metricType,
        value: body.value as never,
        unit: body.unit,
        measuredAt: new Date(body.measuredAt),
        sourceType: body.sourceType,
        sourceRecordId: body.sourceRecordId ?? null,
        note: body.note ?? null,
      },
    });
  }

  async trends(userId: string, memberId?: string, metricType?: string) {
    const rows = await this.list(userId, memberId, metricType);
    return {
      metricType: metricType ?? "ALL",
      points: rows
        .slice()
        .reverse()
        .map((row) => ({
          measuredAt: row.measuredAt,
          value: row.value,
          unit: row.unit,
          sourceType: row.sourceType,
        })),
    };
  }
}
