import { Injectable } from "@nestjs/common";
import { MedicalRecordStatus, TodoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { MemberAccessService } from "../permissions/member-access.service.js";
import { AgentRuleService, type AgentTodoSuggestion } from "./agent-rule.service.js";
import { followUpApproachingRule, visitPackRecentStatusRule } from "./follow-up-and-visit-pack.rules.js";
import { recordCompletenessRule } from "./record-completeness.rule.js";

@Injectable()
export class AgentTodosService {
  private readonly rules = new AgentRuleService([
    recordCompletenessRule,
    followUpApproachingRule,
    visitPackRecentStatusRule,
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async refresh(userId: string, memberId?: string) {
    const resolvedMemberId = await this.access.resolveMemberId(userId, memberId);
    await this.access.assertCan(userId, resolvedMemberId, "reminder.manage");

    const [records, visitPacks] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where: { memberId: resolvedMemberId, status: { not: MedicalRecordStatus.DELETED } },
        select: {
          id: true,
          title: true,
          visitDate: true,
          institution: true,
          healthConcern: true,
          status: true,
        },
      }),
      this.prisma.visitPack.findMany({
        where: { memberId: resolvedMemberId },
        select: {
          id: true,
          visitReason: true,
          recentSymptoms: true,
          status: true,
        },
      }),
    ]);

    const suggestions = this.rules.suggestTodos({
      memberId: resolvedMemberId,
      records,
      visitPacks,
    });

    const todos = [];
    for (const suggestion of suggestions) {
      todos.push(await this.upsertOpenTodo(userId, resolvedMemberId, suggestion));
    }

    return {
      memberId: resolvedMemberId,
      createdOrUpdated: todos.length,
      todos,
    };
  }

  private async upsertOpenTodo(userId: string, memberId: string, suggestion: AgentTodoSuggestion) {
    const existing = await this.prisma.todoItem.findFirst({
      where: {
        memberId,
        type: suggestion.type,
        sourceType: suggestion.sourceType,
        sourceId: suggestion.sourceId,
        status: TodoStatus.OPEN,
      },
    });

    const data = {
      title: suggestion.title,
      dueAt: suggestion.dueAt ?? null,
      sourceType: suggestion.sourceType,
      sourceId: suggestion.sourceId,
      metadata: suggestion.metadata as never,
    };

    if (existing) {
      return this.prisma.todoItem.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.todoItem.create({
      data: {
        memberId,
        createdById: userId,
        type: suggestion.type,
        ...data,
      },
    });
  }
}
