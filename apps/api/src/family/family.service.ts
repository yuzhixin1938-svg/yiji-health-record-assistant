import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccessStatus, HouseholdUserStatus, MemberAccessRole, MemberSubjectType } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { CreateInvitationDto, CreateMemberDto, UpdateAccessDto } from "./family.dto.js";

const crossAccountFamilyAccessDisabledMessage = "第一版暂不支持跨账号家庭邀请或授权";

@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentHousehold(userId: string) {
    const householdLink = await this.prisma.householdUser.findFirst({
      where: { userId, status: HouseholdUserStatus.ACTIVE },
      include: {
        household: {
          include: {
            members: {
              include: { access: true },
              orderBy: { createdAt: "asc" },
            },
            users: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!householdLink) throw new NotFoundException("未找到家庭空间");
    return householdLink.household;
  }

  async listAccessibleMembers(userId: string) {
    return this.prisma.memberProfile.findMany({
      where: {
        access: {
          some: {
            userId,
            status: AccessStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      include: {
        access: {
          where: { userId },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createMember(userId: string, body: CreateMemberDto) {
    if (body.subjectType === MemberSubjectType.SELF) {
      throw new BadRequestException("本人档案由首次登录自动创建");
    }

    const household = await this.getCurrentHousehold(userId);
    const member = await this.prisma.memberProfile.create({
      data: {
        householdId: household.id,
        subjectType: body.subjectType,
        displayName: body.displayName,
        ...(body.dateOfBirth ? { dateOfBirth: new Date(body.dateOfBirth) } : {}),
        access: {
          create: {
            userId,
            role: body.subjectType === MemberSubjectType.MINOR ? MemberAccessRole.GUARDIAN : MemberAccessRole.MANAGER,
            status: AccessStatus.ACTIVE,
            grantedById: userId,
          },
        },
      },
      include: { access: true },
    });

    return member;
  }

  async createInvitation(userId: string, memberId: string, body: CreateInvitationDto) {
    throw new BadRequestException(crossAccountFamilyAccessDisabledMessage);
  }

  async acceptInvitation(userId: string, token: string) {
    throw new BadRequestException(crossAccountFamilyAccessDisabledMessage);
  }

  async listMemberAccess(userId: string, memberId: string) {
    throw new BadRequestException(crossAccountFamilyAccessDisabledMessage);
  }

  async updateMemberAccess(userId: string, memberId: string, targetUserId: string, body: UpdateAccessDto) {
    throw new BadRequestException(crossAccountFamilyAccessDisabledMessage);
  }
}
