import { Injectable, NotFoundException } from "@nestjs/common";
import { TodoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { MemberAccessService } from "../permissions/member-access.service.js";
import type { CreateTodoDto, UpdateTodoDto } from "./todos.dto.js";

@Injectable()
export class TodosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async list(userId: string, memberId?: string, status?: TodoStatus) {
    const resolvedMemberId = await this.access.resolveMemberId(userId, memberId);
    await this.access.assertCan(userId, resolvedMemberId, "reminder.manage");
    return this.prisma.todoItem.findMany({
      where: {
        memberId: resolvedMemberId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async create(userId: string, body: CreateTodoDto) {
    const memberId = await this.access.resolveMemberId(userId, body.memberId);
    await this.access.assertCan(userId, memberId, "reminder.manage");
    return this.prisma.todoItem.create({
      data: {
        memberId,
        createdById: userId,
        ...this.data(body),
      },
    });
  }

  async update(userId: string, todoId: string, body: UpdateTodoDto) {
    const todo = await this.getForUpdate(userId, todoId);
    return this.prisma.todoItem.update({
      where: { id: todo.id },
      data: this.data(body),
    });
  }

  async complete(userId: string, todoId: string) {
    const todo = await this.getForUpdate(userId, todoId);
    return this.prisma.todoItem.update({
      where: { id: todo.id },
      data: { status: TodoStatus.DONE, completedAt: new Date() },
    });
  }

  private async getForUpdate(userId: string, todoId: string) {
    const todo = await this.prisma.todoItem.findUnique({ where: { id: todoId } });
    if (!todo) throw new NotFoundException("未找到待办");
    await this.access.assertCan(userId, todo.memberId, "reminder.manage");
    return todo;
  }

  private data(body: CreateTodoDto | UpdateTodoDto) {
    return {
      type: body.type,
      title: body.title,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      sourceType: body.sourceType ?? null,
      sourceId: body.sourceId ?? null,
      metadata: (body.metadata ?? null) as never,
    };
  }
}
