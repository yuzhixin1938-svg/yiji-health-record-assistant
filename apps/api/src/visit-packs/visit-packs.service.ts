import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MedicalRecordStatus, VisitPackStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { MemberAccessService } from "../permissions/member-access.service.js";
import { createVisitPackShareToken, hashVisitPackShareToken } from "./visit-pack-share-token.js";
import type { CreateVisitPackDto, CreateVisitPackShareDto } from "./visit-packs.dto.js";

type VisitPackAttachmentOptions = {
  includeOriginalFiles: boolean;
  attachmentMode: "none" | "embed_pdf";
};

@Injectable()
export class VisitPacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async list(userId: string, memberId?: string) {
    const resolvedMemberId = await this.access.resolveMemberId(userId, memberId);
    await this.access.assertCan(userId, resolvedMemberId, "summary.manage");
    return this.prisma.visitPack.findMany({
      where: { memberId: resolvedMemberId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(userId: string, body: CreateVisitPackDto) {
    const memberId = await this.access.resolveMemberId(userId, body.memberId);
    await this.access.assertCan(userId, memberId, "summary.manage");
    return this.prisma.visitPack.create({
      data: {
        memberId,
        createdById: userId,
        title: body.title,
        visitReason: body.visitReason,
        recentSymptoms: body.recentSymptoms ?? null,
        questions: body.questions ?? null,
        selectedRecordIds: body.selectedRecordIds,
        content: {
          attachment: this.attachmentOptions(body),
        },
      },
    });
  }

  async get(userId: string, packId: string) {
    const pack = await this.prisma.visitPack.findUnique({ where: { id: packId } });
    if (!pack) throw new NotFoundException("未找到就诊资料包");
    await this.access.assertCan(userId, pack.memberId, "summary.manage");
    return pack;
  }

  async generate(userId: string, packId: string) {
    const pack = await this.get(userId, packId);
    const member = await this.prisma.memberProfile.findUnique({ where: { id: pack.memberId } });
    if (!member) throw new NotFoundException("未找到成员档案");

    const selectedRecordIds = Array.isArray(pack.selectedRecordIds)
      ? pack.selectedRecordIds.filter((id): id is string => typeof id === "string")
      : [];

    const records = await this.prisma.medicalRecord.findMany({
      where: {
        memberId: pack.memberId,
        status: MedicalRecordStatus.ARCHIVED,
        ...(selectedRecordIds.length ? { id: { in: selectedRecordIds } } : {}),
      },
      include: { files: true },
      orderBy: { visitDate: "desc" },
    });

    const content = {
      title: pack.title,
      attachment: this.attachmentOptionsFromPack(pack.content),
      member: {
        displayName: member.displayName,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth,
      },
      visitPurpose: pack.visitReason,
      recentSymptoms: pack.recentSymptoms,
      questions: pack.questions,
      relatedRecords: records.map((record) => ({
        title: record.title,
        recordType: record.recordType,
        visitDate: record.visitDate,
        institution: record.institution,
        files: record.files.map((file) => ({
          originalName: file.originalName,
          fileHash: file.fileHash,
        })),
      })),
    };

    return this.prisma.visitPack.update({
      where: { id: packId },
      data: {
        status: VisitPackStatus.GENERATED,
        content,
        generatedAt: new Date(),
      },
    });
  }

  private attachmentOptions(body: CreateVisitPackDto): VisitPackAttachmentOptions {
    const includeOriginalFiles = body.includeOriginalFiles ?? false;
    return {
      includeOriginalFiles,
      attachmentMode: includeOriginalFiles ? body.attachmentMode ?? "embed_pdf" : "none",
    };
  }

  private attachmentOptionsFromPack(content: unknown): VisitPackAttachmentOptions {
    if (content && typeof content === "object" && "attachment" in content) {
      const attachment = (content as { attachment: Partial<VisitPackAttachmentOptions> }).attachment;
      if (attachment?.includeOriginalFiles && attachment.attachmentMode === "embed_pdf") {
        return { includeOriginalFiles: true, attachmentMode: "embed_pdf" };
      }
    }
    return { includeOriginalFiles: false, attachmentMode: "none" };
  }

  async createShare(userId: string, packId: string, body: CreateVisitPackShareDto) {
    const pack = await this.get(userId, packId);
    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException("分享有效期必须晚于当前时间");
    }

    const shareToken = createVisitPackShareToken();
    const share = await this.prisma.visitPackShare.create({
      data: {
        visitPackId: pack.id,
        tokenHash: shareToken.tokenHash,
        expiresAt,
      },
    });

    return {
      id: share.id,
      visitPackId: share.visitPackId,
      token: shareToken.token,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      accessCount: share.accessCount,
      lastAccessedAt: share.lastAccessedAt,
      sharePath: `/share/visit-pack/${shareToken.token}`,
    };
  }

  async revokeShare(userId: string, packId: string, shareId: string) {
    const pack = await this.get(userId, packId);
    if (pack.createdById !== userId) {
      throw new ForbiddenException("只有资料包创建者可以撤回分享");
    }

    const share = await this.prisma.visitPackShare.findUnique({ where: { id: shareId } });
    if (!share || share.visitPackId !== pack.id) throw new NotFoundException("未找到分享链接");

    if (share.revokedAt) return share;

    return this.prisma.visitPackShare.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    });
  }

  async getSharedPack(token: string) {
    const share = await this.prisma.visitPackShare.findUnique({
      where: { tokenHash: hashVisitPackShareToken(token) },
      include: { visitPack: true },
    });
    if (!share || share.revokedAt || share.expiresAt <= new Date()) {
      throw new NotFoundException("分享链接不存在或已失效");
    }

    await this.prisma.visitPackShare.update({
      where: { id: share.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    return {
      id: share.visitPack.id,
      title: share.visitPack.title,
      visitReason: share.visitPack.visitReason,
      recentSymptoms: share.visitPack.recentSymptoms,
      questions: share.visitPack.questions,
      status: share.visitPack.status,
      content: share.visitPack.content,
      generatedAt: share.visitPack.generatedAt,
      share: {
        id: share.id,
        expiresAt: share.expiresAt,
      },
    };
  }
}
