import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { TodoStatus } from "../generated/prisma/enums.js";
import { CreateTodoDto, UpdateTodoDto } from "./todos.dto.js";
import { TodosService } from "./todos.service.js";

@UseGuards(AuthGuard)
@Controller("todos")
export class TodosController {
  constructor(
    private readonly todos: TodosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("memberId") memberId?: string,
    @Query("status") status?: TodoStatus,
  ) {
    return this.todos.list(request.user.id, memberId, status);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateTodoDto) {
    const todo = await this.todos.create(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: todo.memberId,
      action: "todo.create",
      resourceType: "todo",
      resourceId: todo.id,
      requestId: request.requestId,
      metadata: { type: todo.type },
    });
    return todo;
  }

  @Patch(":todoId")
  async update(
    @Req() request: AuthenticatedRequest,
    @Param("todoId") todoId: string,
    @Body() body: UpdateTodoDto,
  ) {
    const todo = await this.todos.update(request.user.id, todoId, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: todo.memberId,
      action: "todo.update",
      resourceType: "todo",
      resourceId: todo.id,
      requestId: request.requestId,
      metadata: { type: todo.type },
    });
    return todo;
  }

  @Post(":todoId/complete")
  async complete(@Req() request: AuthenticatedRequest, @Param("todoId") todoId: string) {
    const todo = await this.todos.complete(request.user.id, todoId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: todo.memberId,
      action: "todo.complete",
      resourceType: "todo",
      resourceId: todo.id,
      requestId: request.requestId,
      metadata: { type: todo.type },
    });
    return todo;
  }
}
