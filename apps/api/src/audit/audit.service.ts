import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

export type AuditInput = {
  actorUserId?: string | null;
  memberId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  result?: string;
  reasonCode?: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        memberId: input.memberId ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        result: input.result ?? "SUCCESS",
        reasonCode: input.reasonCode ?? null,
        requestId: input.requestId,
        metadata: (input.metadata ?? null) as never,
      },
    });
  }
}
