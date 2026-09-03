import { Body, Controller, Get, Header, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CreateVisitPackDto, CreateVisitPackShareDto } from "./visit-packs.dto.js";
import { VisitPackPdfService } from "./visit-pack-pdf.service.js";
import { VisitPacksService } from "./visit-packs.service.js";

@UseGuards(AuthGuard)
@Controller("visit-packs")
export class VisitPacksController {
  constructor(
    private readonly visitPacks: VisitPacksService,
    private readonly visitPackPdf: VisitPackPdfService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query("memberId") memberId?: string) {
    return this.visitPacks.list(request.user.id, memberId);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateVisitPackDto) {
    const pack = await this.visitPacks.create(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: pack.memberId,
      action: "visit_pack.create",
      resourceType: "visit_pack",
      resourceId: pack.id,
      requestId: request.requestId,
      metadata: { selectedRecordCount: body.selectedRecordIds.length },
    });
    return pack;
  }

  @Get(":packId")
  async get(@Req() request: AuthenticatedRequest, @Param("packId") packId: string) {
    return this.visitPacks.get(request.user.id, packId);
  }

  @Post(":packId/generate")
  async generate(@Req() request: AuthenticatedRequest, @Param("packId") packId: string) {
    const pack = await this.visitPacks.generate(request.user.id, packId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: pack.memberId,
      action: "visit_pack.generate",
      resourceType: "visit_pack",
      resourceId: pack.id,
      requestId: request.requestId,
    });
    return pack;
  }

  @Post(":packId/shares")
  async createShare(
    @Req() request: AuthenticatedRequest,
    @Param("packId") packId: string,
    @Body() body: CreateVisitPackShareDto,
  ) {
    const share = await this.visitPacks.createShare(request.user.id, packId, body);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "visit_pack.share.create",
      resourceType: "visit_pack_share",
      resourceId: share.id,
      requestId: request.requestId,
      metadata: { visitPackId: packId, expiresAt: share.expiresAt.toISOString() },
    });
    return share;
  }

  @Post(":packId/shares/:shareId/revoke")
  async revokeShare(
    @Req() request: AuthenticatedRequest,
    @Param("packId") packId: string,
    @Param("shareId") shareId: string,
  ) {
    const share = await this.visitPacks.revokeShare(request.user.id, packId, shareId);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "visit_pack.share.revoke",
      resourceType: "visit_pack_share",
      resourceId: share.id,
      requestId: request.requestId,
      metadata: { visitPackId: packId },
    });
    return share;
  }

  @Get(":packId/export.pdf")
  @Header("Content-Type", "application/pdf")
  async exportPdf(
    @Req() request: AuthenticatedRequest,
    @Param("packId") packId: string,
    @Res() response: Response,
  ) {
    const exported = await this.visitPackPdf.exportPdf(request.user.id, packId);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "visit_pack.export_pdf",
      resourceType: "visit_pack",
      resourceId: packId,
      requestId: request.requestId,
    });
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`);
    response.send(exported.buffer);
  }
}

@Controller("share/visit-pack")
export class VisitPackSharesPublicController {
  constructor(private readonly visitPacks: VisitPacksService) {}

  @Get(":token")
  async getSharedPack(@Param("token") token: string) {
    return this.visitPacks.getSharedPack(token);
  }
}
