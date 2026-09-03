import { Injectable, NotFoundException } from "@nestjs/common";
import { MedicalRecordStatus, MemberSubjectType } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { UpsertMyProfileDto } from "./onboarding.dto.js";

type OnboardingTask = {
  key: string;
  title: string;
  completed: boolean;
  action: string;
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const profile = await this.getSelfProfile(userId);
    const tasks = await this.getTasks(userId);
    return {
      profileCompleted: profile.profileCompletedAt !== null,
      completedTasks: tasks.filter((task) => task.completed).length,
      totalTasks: tasks.length,
      nextTask: tasks.find((task) => !task.completed) ?? null,
    };
  }

  async getMyProfile(userId: string) {
    return this.getSelfProfile(userId);
  }

  async upsertMyProfile(userId: string, body: UpsertMyProfileDto) {
    const profile = await this.getSelfProfile(userId);
    return this.prisma.memberProfile.update({
      where: { id: profile.id },
      data: {
        displayName: body.displayName,
        ...(body.gender ? { gender: body.gender } : {}),
        ...(body.dateOfBirth ? { dateOfBirth: new Date(body.dateOfBirth) } : {}),
        healthConcerns: body.healthConcerns,
        allergyNote: body.allergyNote ?? null,
        chronicDiseaseNote: body.chronicDiseaseNote ?? null,
        medicationStatus: body.medicationStatus ?? null,
        followUpPlanStatus: body.followUpPlanStatus ?? null,
        profileCompletedAt: new Date(),
      },
    });
  }

  async getTasks(userId: string): Promise<OnboardingTask[]> {
    const profile = await this.getSelfProfile(userId);
    const firstRecord = await this.prisma.medicalRecord.findFirst({
      where: {
        memberId: profile.id,
        status: { in: [MedicalRecordStatus.PENDING_REVIEW, MedicalRecordStatus.ARCHIVED] },
      },
      select: { id: true },
    });
    const [firstMedicine, firstMetric, firstTodo] = await Promise.all([
      this.prisma.medicine.findFirst({
        where: { memberId: profile.id, stoppedAt: null },
        select: { id: true },
      }),
      this.prisma.metricRecord.findFirst({
        where: { memberId: profile.id },
        select: { id: true },
      }),
      this.prisma.todoItem.findFirst({
        where: { memberId: profile.id },
        select: { id: true },
      }),
    ]);

    return [
      {
        key: "profile",
        title: "完成本人基础健康档案",
        completed: profile.profileCompletedAt !== null,
        action: "填写姓名、关注问题和重要健康信息",
      },
      {
        key: "first_record",
        title: "上传第一份病历资料",
        completed: firstRecord !== null,
        action: "上传门诊记录、检查报告、处方、体检报告或照片",
      },
      {
        key: "first_medicine",
        title: "添加正在使用的药品",
        completed: firstMedicine !== null,
        action: "补充药品名称、用途、用法用量和提醒",
      },
      {
        key: "first_metric",
        title: "记录一次近期指标",
        completed: firstMetric !== null,
        action: "记录体重、血压、血糖、心率或体温",
      },
      {
        key: "first_todo",
        title: "设置一个复查或用药待办",
        completed: firstTodo !== null,
        action: "添加复查、用药或资料核对待办",
      },
    ];
  }

  private async getSelfProfile(userId: string) {
    const profile = await this.prisma.memberProfile.findFirst({
      where: {
        subjectUserId: userId,
        subjectType: MemberSubjectType.SELF,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!profile) throw new NotFoundException("未找到本人健康档案，请先完成登录初始化");
    return profile;
  }
}
