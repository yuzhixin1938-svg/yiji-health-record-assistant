import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MemberAccessService } from "../permissions/member-access.service.js";
import type { CreateMedicineDto, UpdateMedicineDto } from "./medicines.dto.js";

@Injectable()
export class MedicinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async list(userId: string, memberId?: string) {
    const resolvedMemberId = await this.access.resolveMemberId(userId, memberId);
    await this.access.assertCan(userId, resolvedMemberId, "medicine.manage");
    return this.prisma.medicine.findMany({
      where: { memberId: resolvedMemberId },
      include: { schedules: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(userId: string, body: CreateMedicineDto) {
    const memberId = await this.access.resolveMemberId(userId, body.memberId);
    await this.access.assertCan(userId, memberId, "medicine.manage");
    return this.prisma.medicine.create({
      data: {
        ...this.data(body),
        memberId,
        createdById: userId,
        ...(body.schedules?.length ? { schedules: { create: body.schedules } } : {}),
      },
      include: { schedules: true },
    });
  }

  async update(userId: string, medicineId: string, body: UpdateMedicineDto) {
    const existing = await this.getForUpdate(userId, medicineId);
    return this.prisma.$transaction(async (tx) => {
      if (body.schedules) {
        await tx.medicationSchedule.deleteMany({ where: { medicineId } });
      }
      return tx.medicine.update({
        where: { id: existing.id },
        data: {
          ...this.data(body),
          ...(body.schedules?.length ? { schedules: { create: body.schedules } } : {}),
        },
        include: { schedules: true },
      });
    });
  }

  async stop(userId: string, medicineId: string) {
    const existing = await this.getForUpdate(userId, medicineId);
    return this.prisma.medicine.update({
      where: { id: existing.id },
      data: { stoppedAt: new Date() },
      include: { schedules: true },
    });
  }

  private async getForUpdate(userId: string, medicineId: string) {
    const medicine = await this.prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw new NotFoundException("未找到药品");
    await this.access.assertCan(userId, medicine.memberId, "medicine.manage");
    return medicine;
  }

  private data(body: CreateMedicineDto | UpdateMedicineDto) {
    return {
      name: body.name,
      specification: body.specification ?? null,
      purposeNote: body.purposeNote ?? null,
      dosageInstruction: body.dosageInstruction,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      currentQuantity: body.currentQuantity ?? null,
      quantityUnit: body.quantityUnit ?? null,
      expiresOn: body.expiresOn ? new Date(body.expiresOn) : null,
      storageLocation: body.storageLocation ?? null,
      reminderEnabled: body.reminderEnabled ?? false,
    };
  }
}
