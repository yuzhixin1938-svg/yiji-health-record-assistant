import { Controller, Get, Header, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { AccountService } from "./account.service.js";

@UseGuards(AuthGuard)
@Controller("account")
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly audit: AuditService,
  ) {}

  @Get("export")
  @Header("Content-Type", "application/json; charset=utf-8")
  async exportData(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    const data = await this.accountService.exportUserData(request.user.id);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "account.export",
      resourceType: "account",
      resourceId: request.user.id,
      requestId: request.requestId,
    });

    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("医记-全部资料.json")}`);
    response.send(JSON.stringify(data, null, 2));
  }

  @Post("deletion-request")
  async requestDeletion(@Req() request: AuthenticatedRequest) {
    const result = await this.accountService.requestDeletion(request.user.id);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "account.deletion.request",
      resourceType: "account",
      resourceId: request.user.id,
      requestId: request.requestId,
    });
    return result;
  }

  @Get("deletion-status")
  async deletionStatus(@Req() request: AuthenticatedRequest) {
    return this.accountService.getDeletionStatus(request.user.id);
  }

  @Post("deletion-cancel")
  async cancelDeletion(@Req() request: AuthenticatedRequest) {
    const result = await this.accountService.cancelDeletion(request.user.id);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "account.deletion.cancel",
      resourceType: "account",
      resourceId: request.user.id,
      requestId: request.requestId,
    });
    return result;
  }
}
