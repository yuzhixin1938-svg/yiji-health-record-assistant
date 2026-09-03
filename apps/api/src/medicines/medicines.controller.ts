import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CreateMedicineDto, UpdateMedicineDto } from "./medicines.dto.js";
import { MedicinesService } from "./medicines.service.js";

@UseGuards(AuthGuard)
@Controller("medicines")
export class MedicinesController {
  constructor(
    private readonly medicines: MedicinesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query("memberId") memberId?: string) {
    return this.medicines.list(request.user.id, memberId);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateMedicineDto) {
    const medicine = await this.medicines.create(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: medicine.memberId,
      action: "medicine.create",
      resourceType: "medicine",
      resourceId: medicine.id,
      requestId: request.requestId,
    });
    return medicine;
  }

  @Patch(":medicineId")
  async update(
    @Req() request: AuthenticatedRequest,
    @Param("medicineId") medicineId: string,
    @Body() body: UpdateMedicineDto,
  ) {
    const medicine = await this.medicines.update(request.user.id, medicineId, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: medicine.memberId,
      action: "medicine.update",
      resourceType: "medicine",
      resourceId: medicine.id,
      requestId: request.requestId,
    });
    return medicine;
  }

  @Post(":medicineId/stop")
  async stop(@Req() request: AuthenticatedRequest, @Param("medicineId") medicineId: string) {
    const medicine = await this.medicines.stop(request.user.id, medicineId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: medicine.memberId,
      action: "medicine.stop",
      resourceType: "medicine",
      resourceId: medicine.id,
      requestId: request.requestId,
    });
    return medicine;
  }
}
