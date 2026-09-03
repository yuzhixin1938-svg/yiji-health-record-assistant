import { Injectable } from "@nestjs/common";
import { AccessStatus, MedicalRecordStatus, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { RecordFileStorageService } from "../records/record-file-storage.service.js";

const deletionCoolingOffDays = 15;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: RecordFileStorageService,
  ) {}

  async exportUserData(userId: string) {
    const accessRows = await this.prisma.memberAccess.findMany({
      where: { userId, status: AccessStatus.ACTIVE },
      select: { memberId: true, role: true, expiresAt: true },
    });
    const memberIds = accessRows.map((row) => row.memberId);

    const [user, identities, members, records, medicines, metrics, todos, visitPacks] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, createdAt: true } }),
      this.prisma.authIdentity.findMany({
        where: { userId },
        select: { provider: true, providerSubject: true, verifiedAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.memberProfile.findMany({
        where: { id: { in: memberIds } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.medicalRecord.findMany({
        where: { memberId: { in: memberIds }, status: { not: MedicalRecordStatus.DELETED } },
        include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.medicine.findMany({
        where: { memberId: { in: memberIds } },
        include: { schedules: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.metricRecord.findMany({
        where: { memberId: { in: memberIds } },
        orderBy: { measuredAt: "desc" },
      }),
      this.prisma.todoItem.findMany({
        where: { memberId: { in: memberIds } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.visitPack.findMany({
        where: { memberId: { in: memberIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user,
      identities,
      memberAccess: accessRows,
      members,
      records: records.map((record) => ({
        ...record,
        files: record.files.map((file) => ({
          id: file.id,
          recordId: file.recordId,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          fileHash: file.fileHash,
          createdAt: file.createdAt,
          downloadPath: `/v1/records/${record.id}/files/${file.id}/original`,
        })),
      })),
      medicines,
      metrics,
      todos,
      visitPacks,
    };
  }

  async requestDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.DELETION_PENDING },
    });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true, status: UserStatus.DELETION_PENDING, coolingOffDays: deletionCoolingOffDays };
  }

  async getDeletionStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, updatedAt: true },
    });
    if (!user) return { status: UserStatus.DELETED, scheduledPurgeAt: null };

    return {
      status: user.status,
      scheduledPurgeAt:
        user.status === UserStatus.DELETION_PENDING
          ? new Date(user.updatedAt.getTime() + deletionCoolingOffDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
    };
  }

  async cancelDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
    return { ok: true, status: UserStatus.ACTIVE };
  }

  async purgeDeletionPendingUsers(options: { dryRun: boolean; now?: Date } = { dryRun: true }) {
    const now = options.now ?? new Date();
    const cutoff = new Date(now.getTime() - deletionCoolingOffDays * 24 * 60 * 60 * 1000);
    const users = await this.prisma.user.findMany({
      where: { status: UserStatus.DELETION_PENDING, updatedAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    });

    const results: Array<{ userId: string; purged: boolean; files: number }> = [];
    for (const user of users) {
      const files = await this.filesForUserPurge(user.id);
      if (!options.dryRun) {
        for (const file of files) await this.fileStorage.delete(file.storagePath);
        await this.purgeUserRows(user.id);
      }
      results.push({ userId: user.id, purged: !options.dryRun, files: files.length });
    }

    return { dryRun: options.dryRun, cutoff: cutoff.toISOString(), users: results };
  }

  private async filesForUserPurge(userId: string) {
    const ownedHouseholds = await this.prisma.household.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    const ownedHouseholdIds = ownedHouseholds.map((row) => row.id);
    const ownedMembers = await this.prisma.memberProfile.findMany({
      where: { OR: [{ householdId: { in: ownedHouseholdIds } }, { subjectUserId: userId }] },
      select: { id: true },
    });
    const memberIds = ownedMembers.map((row) => row.id);
    const records = await this.prisma.medicalRecord.findMany({
      where: { OR: [{ uploadedById: userId }, { memberId: { in: memberIds } }] },
      include: { files: true },
    });
    return records.flatMap((record) => record.files.map((file) => ({ storagePath: file.storagePath })));
  }

  private async purgeUserRows(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ownedHouseholds = await tx.household.findMany({ where: { ownerUserId: userId }, select: { id: true } });
      const ownedHouseholdIds = ownedHouseholds.map((row) => row.id);
      const ownedMembers = await tx.memberProfile.findMany({
        where: { OR: [{ householdId: { in: ownedHouseholdIds } }, { subjectUserId: userId }] },
        select: { id: true },
      });
      const memberIds = ownedMembers.map((row) => row.id);
      const records = await tx.medicalRecord.findMany({
        where: { OR: [{ uploadedById: userId }, { memberId: { in: memberIds } }] },
        select: { id: true },
      });
      const recordIds = records.map((row) => row.id);

      await tx.recognizedField.deleteMany({ where: { task: { recordId: { in: recordIds } } } });
      await tx.recognitionTask.deleteMany({ where: { recordId: { in: recordIds } } });
      await tx.medicalRecordFile.deleteMany({ where: { recordId: { in: recordIds } } });
      await tx.medicalRecord.deleteMany({ where: { id: { in: recordIds } } });
      await tx.medicine.deleteMany({ where: { OR: [{ createdById: userId }, { memberId: { in: memberIds } }] } });
      await tx.metricRecord.deleteMany({ where: { OR: [{ createdById: userId }, { memberId: { in: memberIds } }] } });
      await tx.todoItem.deleteMany({ where: { OR: [{ createdById: userId }, { memberId: { in: memberIds } }] } });
      await tx.visitPack.deleteMany({ where: { OR: [{ createdById: userId }, { memberId: { in: memberIds } }] } });
      await tx.memberInvitation.deleteMany({ where: { OR: [{ invitedById: userId }, { memberId: { in: memberIds } }] } });
      await tx.memberAccess.deleteMany({ where: { OR: [{ userId }, { grantedById: userId }, { memberId: { in: memberIds } }] } });
      await tx.consentReceipt.deleteMany({ where: { OR: [{ userId }, { memberId: { in: memberIds } }] } });
      await tx.householdUser.deleteMany({ where: { OR: [{ userId }, { householdId: { in: ownedHouseholdIds } }] } });
      await tx.memberProfile.deleteMany({ where: { id: { in: memberIds } } });
      await tx.household.deleteMany({ where: { id: { in: ownedHouseholdIds } } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.authIdentity.deleteMany({ where: { userId } });
      await tx.auditEvent.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });
      await tx.user.update({ where: { id: userId }, data: { status: UserStatus.DELETED } });
    });
  }
}
