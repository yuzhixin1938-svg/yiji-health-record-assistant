import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CreateInvitationDto, CreateMemberDto, UpdateAccessDto } from "./family.dto.js";
import { FamilyService } from "./family.service.js";

@UseGuards(AuthGuard)
@Controller()
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Get("households/current")
  async getCurrentHousehold(@Req() request: AuthenticatedRequest) {
    return this.familyService.getCurrentHousehold(request.user.id);
  }

  @Get("members")
  async listMembers(@Req() request: AuthenticatedRequest) {
    return this.familyService.listAccessibleMembers(request.user.id);
  }

  @Post("members")
  async createMember(@Req() request: AuthenticatedRequest, @Body() body: CreateMemberDto) {
    return this.familyService.createMember(request.user.id, body);
  }

  @Post("members/:memberId/invitations")
  async createInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("memberId") memberId: string,
    @Body() body: CreateInvitationDto,
  ) {
    return this.familyService.createInvitation(request.user.id, memberId, body);
  }

  @Post("invitations/:token/accept")
  async acceptInvitation(@Req() request: AuthenticatedRequest, @Param("token") token: string) {
    return this.familyService.acceptInvitation(request.user.id, token);
  }

  @Get("members/:memberId/access")
  async listMemberAccess(@Req() request: AuthenticatedRequest, @Param("memberId") memberId: string) {
    return this.familyService.listMemberAccess(request.user.id, memberId);
  }

  @Patch("members/:memberId/access/:userId")
  async updateMemberAccess(
    @Req() request: AuthenticatedRequest,
    @Param("memberId") memberId: string,
    @Param("userId") targetUserId: string,
    @Body() body: UpdateAccessDto,
  ) {
    return this.familyService.updateMemberAccess(request.user.id, memberId, targetUserId, body);
  }
}
