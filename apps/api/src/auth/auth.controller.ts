import { Body, Controller, Delete, Post, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { RequestWithId } from "../common/request-context.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { SendEmailCodeDto, SendSmsDto, VerifyEmailCodeDto, VerifySmsDto } from "./auth.dto.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post("sms/send")
  async sendSms(@Body() body: SendSmsDto): Promise<{ expiresAt: Date; mockCode?: string }> {
    return this.authService.sendSms(body.phone);
  }

  @Post("sms/verify")
  async verifySms(@Req() request: RequestWithId, @Body() body: VerifySmsDto) {
    try {
      const result = await this.authService.verifySms(body.phone, body.code, body.deviceId);
      await this.audit.record({
        actorUserId: result.user.id,
        action: "auth.login",
        resourceType: "session",
        result: "SUCCESS",
        requestId: request.requestId,
      });
      return result;
    } catch (error) {
      await this.audit.record({
        actorUserId: null,
        action: "auth.login",
        resourceType: "session",
        result: "FAILURE",
        reasonCode: "SMS_VERIFY_FAILED",
        requestId: request.requestId,
      });
      throw error;
    }
  }

  @Post("email/send")
  async sendEmailCode(@Body() body: SendEmailCodeDto): Promise<{ expiresAt: Date; mockCode?: string }> {
    return this.authService.sendEmailCode(body.email);
  }

  @Post("email/verify")
  async verifyEmailCode(@Req() request: RequestWithId, @Body() body: VerifyEmailCodeDto) {
    try {
      const result = await this.authService.verifyEmailCode(body.email, body.code, body.deviceId);
      await this.audit.record({
        actorUserId: result.user.id,
        action: "auth.email.login",
        resourceType: "session",
        result: "SUCCESS",
        requestId: request.requestId,
      });
      return result;
    } catch (error) {
      await this.audit.record({
        actorUserId: null,
        action: "auth.email.login",
        resourceType: "session",
        result: "FAILURE",
        reasonCode: "EMAIL_VERIFY_FAILED",
        requestId: request.requestId,
      });
      throw error;
    }
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  async logout(@Req() request: AuthenticatedRequest): Promise<{ ok: true }> {
    await this.authService.revokeSession(request.user.id, request.user.sessionId);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "auth.logout",
      resourceType: "session",
      resourceId: request.user.sessionId,
      result: "SUCCESS",
      requestId: request.requestId,
    });
    return { ok: true };
  }

  @Delete("sessions")
  @UseGuards(AuthGuard)
  async revokeAllSessions(@Req() request: AuthenticatedRequest): Promise<{ revoked: number }> {
    const revoked = await this.authService.revokeAllSessions(request.user.id);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "auth.sessions.revoke_all",
      resourceType: "session",
      result: "SUCCESS",
      requestId: request.requestId,
      metadata: { revoked },
    });
    return { revoked };
  }
}
