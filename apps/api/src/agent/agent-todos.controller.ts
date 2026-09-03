import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { RefreshAgentTodosDto } from "./agent-todos.dto.js";
import { AgentTodosService } from "./agent-todos.service.js";

@UseGuards(AuthGuard)
@Controller("agent/todos")
export class AgentTodosController {
  constructor(
    private readonly agentTodos: AgentTodosService,
    private readonly audit: AuditService,
  ) {}

  @Post("refresh")
  async refresh(@Req() request: AuthenticatedRequest, @Body() body: RefreshAgentTodosDto) {
    const result = await this.agentTodos.refresh(request.user.id, body.memberId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: result.memberId,
      action: "agent.todos.refresh",
      resourceType: "todo",
      resourceId: result.memberId,
      requestId: request.requestId,
      metadata: { createdOrUpdated: result.createdOrUpdated },
    });
    return result;
  }
}
