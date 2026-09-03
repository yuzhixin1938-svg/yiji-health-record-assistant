import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MemberSubjectType } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { canAccessMember, type MemberAction } from "./member-permission.js";

@Injectable()
export class MemberAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getSelfMemberId(userId: string): Promise<string> {
    const profile = await this.prisma.memberProfile.findFirst({
      where: { subjectUserId: userId, subjectType: MemberSubjectType.SELF },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!profile) throw new NotFoundException("未找到本人健康档案");
    return profile.id;
  }

  async resolveMemberId(userId: string, memberId?: string): Promise<string> {
    return memberId ?? this.getSelfMemberId(userId);
  }

  async assertCan(userId: string, memberId: string, action: MemberAction): Promise<void> {
    const grant = await this.prisma.memberAccess.findUnique({
      where: { memberId_userId: { memberId, userId } },
    });

    const allowed = canAccessMember({
      actorUserId: userId,
      resourceMemberId: memberId,
      action,
      grant: grant
        ? {
            memberId: grant.memberId,
            userId: grant.userId,
            role: grant.role,
            status: grant.status,
            expiresAt: grant.expiresAt,
          }
        : null,
    });

    if (!allowed) throw new ForbiddenException("无权访问该成员资料");
  }
}
