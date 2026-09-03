import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { OnboardingService } from "./onboarding.service.js";
import { UpsertMyProfileDto } from "./onboarding.dto.js";

@UseGuards(AuthGuard)
@Controller()
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly audit: AuditService,
  ) {}

  @Get("onboarding/status")
  async getStatus(@Req() request: AuthenticatedRequest) {
    return this.onboardingService.getStatus(request.user.id);
  }

  @Get("onboarding/tasks")
  async getTasks(@Req() request: AuthenticatedRequest) {
    return this.onboardingService.getTasks(request.user.id);
  }

  @Get("profile/me")
  async getMyProfile(@Req() request: AuthenticatedRequest) {
    return this.onboardingService.getMyProfile(request.user.id);
  }

  @Post("onboarding/profile")
  async createMyProfile(@Req() request: AuthenticatedRequest, @Body() body: UpsertMyProfileDto) {
    const profile = await this.onboardingService.upsertMyProfile(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: profile.id,
      action: "profile.upsert",
      resourceType: "member_profile",
      resourceId: profile.id,
      requestId: request.requestId,
    });
    return profile;
  }

  @Patch("profile/me")
  async updateMyProfile(@Req() request: AuthenticatedRequest, @Body() body: UpsertMyProfileDto) {
    const profile = await this.onboardingService.upsertMyProfile(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: profile.id,
      action: "profile.upsert",
      resourceType: "member_profile",
      resourceId: profile.id,
      requestId: request.requestId,
    });
    return profile;
  }
}
