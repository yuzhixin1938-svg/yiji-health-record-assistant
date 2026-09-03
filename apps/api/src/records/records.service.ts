import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { MedicalRecordStatus, MemberSubjectType, RecognitionTaskStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { canAccessMember } from "../permissions/member-permission.js";
import { RecognitionService, type RecognitionResult } from "./recognition.service.js";
import { RecordFileStorageService } from "./record-file-storage.service.js";
import type { CreateManualRecordDto, ReviewRecordDto, UploadRecordDto } from "./records.dto.js";

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recognitionService: RecognitionService,
    private readonly fileStorage: RecordFileStorageService,
  ) {}

  async listRecords(userId: string, memberId?: string) {
    const resolvedMemberId = memberId ?? (await this.getSelfMemberId(userId));
    await this.assertCan(userId, resolvedMemberId, "record.read");

    return this.prisma.medicalRecord.findMany({
      where: { memberId: resolvedMemberId, status: { not: MedicalRecordStatus.DELETED } },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async timeline(userId: string, memberId?: string, healthConcern?: string) {
    const resolvedMemberId = memberId ?? (await this.getSelfMemberId(userId));
    await this.assertCan(userId, resolvedMemberId, "record.read");

    const records = await this.prisma.medicalRecord.findMany({
      where: {
        memberId: resolvedMemberId,
        status: { not: MedicalRecordStatus.DELETED },
        ...(healthConcern ? { healthConcern } : {}),
      },
      include: { files: true },
      orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
    });

    return {
      memberId: resolvedMemberId,
      mode: healthConcern ? "category" : "all",
      healthConcern: healthConcern ?? null,
      items: records.map((record) => ({
        id: record.id,
        date: this.formatDate(record.visitDate),
        happened: record.title,
        healthConcern: record.healthConcern,
        recordType: record.recordType,
        institution: record.institution,
        recordIds: [record.id],
        fileCount: record.files.length,
        canAddToVisitPack: true,
      })),
    };
  }

  async getRecord(userId: string, recordId: string) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: recordId },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
    if (!record) throw new NotFoundException("未找到病历资料");
    if (record.status === MedicalRecordStatus.DELETED) throw new NotFoundException("未找到病历资料");

    await this.assertCan(userId, record.memberId, "record.read");
    return record;
  }

  async getRecognition(userId: string, recordId: string) {
    const record = await this.getRecord(userId, recordId);
    return record.recognitionTasks;
  }

  async getOriginalFile(userId: string, recordId: string, fileId: string) {
    const record = await this.getRecord(userId, recordId);
    const file = record.files.find((item) => item.id === fileId);
    if (!file) throw new NotFoundException("未找到原始文件");

    return {
      memberId: record.memberId,
      file,
      content: await this.fileStorage.read(file.storagePath),
    };
  }

  async createManualRecord(userId: string, body: CreateManualRecordDto) {
    const memberId = body.memberId ?? (await this.getSelfMemberId(userId));
    await this.assertCan(userId, memberId, "record.create");

    const now = new Date();
    return this.prisma.medicalRecord.create({
      data: {
        memberId,
        uploadedById: userId,
        title: body.title,
        recordType: body.recordType,
        visitDate: body.visitDate ? new Date(body.visitDate) : null,
        institution: body.institution ?? null,
        healthConcern: body.healthConcern ?? null,
        status: MedicalRecordStatus.ARCHIVED,
        reviewedAt: now,
        archivedAt: now,
        extractedFields: {
          source: "user_input",
          needsUserReview: false,
        },
      },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
  }

  async uploadRecord(userId: string, body: UploadRecordDto, files?: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException("请上传文件");

    const memberId = body.memberId ?? (await this.getSelfMemberId(userId));
    await this.assertCan(userId, memberId, "record.create");

    const prepared = await this.prepareUploadedFiles(memberId, body, files);
    const recognition = this.mergeRecognitions(prepared.map((item) => item.recognition), prepared.map((item) => item.originalName), body);
    const fileHash = createHash("sha256").update(prepared.map((item) => item.fileHash).join(":")).digest("hex");

    return this.prisma.medicalRecord.create({
      data: {
        memberId,
        uploadedById: userId,
        title: recognition.title,
        recordType: recognition.recordType,
        ...(recognition.visitDate ? { visitDate: new Date(recognition.visitDate) } : {}),
        institution: recognition.institution,
        healthConcern: recognition.healthConcern,
        status: MedicalRecordStatus.PENDING_REVIEW,
        extractedFields: {
          source: recognition.engine,
          needsUserReview: true,
          title: recognition.title,
          recordType: recognition.recordType,
          visitDate: recognition.visitDate,
          institution: recognition.institution,
          healthConcern: recognition.healthConcern,
          originalName: prepared[0]?.originalName,
          originalNames: prepared.map((item) => item.originalName),
          fileHash,
          storageProvider: prepared[0]?.storedFile.storageProvider,
          fileCount: prepared.length,
          fields: recognition.fields,
        },
        files: {
          create: prepared.map((item) => ({
            originalName: item.originalName,
            mimeType: item.file.mimetype,
            sizeBytes: item.file.size,
            storagePath: item.storedFile.storagePath,
            fileHash: item.fileHash,
          })),
        },
        recognitionTasks: {
          create: {
            engine: recognition.engine,
            rawText: recognition.rawText,
            fields: {
              create: recognition.fields.map((recognizedField) => ({
                fieldName: recognizedField.fieldName,
                fieldValue: recognizedField.fieldValue,
                sourceType: recognizedField.sourceType,
                sourceText: recognizedField.sourceText,
                confidence: recognizedField.confidence,
              })),
            },
          },
        },
      },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
  }

  async addRecordFiles(userId: string, recordId: string, body: UploadRecordDto, files?: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException("请上传文件");
    const record = await this.getRecord(userId, recordId);
    await this.assertCan(userId, record.memberId, "record.update");

    const prepared = await this.prepareUploadedFiles(record.memberId, body, files);
    const recognition = this.mergeRecognitions(prepared.map((item) => item.recognition), prepared.map((item) => item.originalName), body);

    return this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        status: MedicalRecordStatus.PENDING_REVIEW,
        extractedFields: {
          source: recognition.engine,
          needsUserReview: true,
          title: record.title,
          recordType: record.recordType,
          visitDate: record.visitDate?.toISOString().slice(0, 10) ?? null,
          institution: record.institution,
          healthConcern: record.healthConcern,
          addedOriginalNames: prepared.map((item) => item.originalName),
          fields: recognition.fields,
        },
        files: {
          create: prepared.map((item) => ({
            originalName: item.originalName,
            mimeType: item.file.mimetype,
            sizeBytes: item.file.size,
            storagePath: item.storedFile.storagePath,
            fileHash: item.fileHash,
          })),
        },
        recognitionTasks: {
          create: {
            engine: recognition.engine,
            rawText: recognition.rawText,
            fields: {
              create: recognition.fields.map((recognizedField) => ({
                fieldName: recognizedField.fieldName,
                fieldValue: recognizedField.fieldValue,
                sourceType: recognizedField.sourceType,
                sourceText: recognizedField.sourceText,
                confidence: recognizedField.confidence,
              })),
            },
          },
        },
      },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
  }

  async testRecognition(userId: string, body: UploadRecordDto, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("请上传文件");

    const memberId = body.memberId ?? (await this.getSelfMemberId(userId));
    await this.assertCan(userId, memberId, "record.create");

    const originalName = this.decodeOriginalName(file.originalname);
    try {
      const recognition = await this.recognitionService.recognize({
        path: file.path,
        mimeType: file.mimetype,
        originalName,
        ...(body.recognitionMode ? { recognitionMode: body.recognitionMode } : {}),
        skipVisionFileQuota: true,
      });
      return {
        originalName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        recognition,
      };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async reviewRecord(userId: string, recordId: string, body: ReviewRecordDto) {
    const record = await this.getRecord(userId, recordId);
    await this.assertCan(userId, record.memberId, "record.update");

    return this.prisma.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const latestTask = record.recognitionTasks[0];
      if (latestTask) {
        await tx.recognitionTask.update({
          where: { id: latestTask.id },
          data: { status: RecognitionTaskStatus.REVIEWED, reviewedAt },
        });

        const userValues = {
          title: body.title,
          recordType: body.recordType,
          visitDate: body.visitDate ?? null,
          institution: body.institution ?? null,
          healthConcern: body.healthConcern ?? null,
        };

        await Promise.all(
          Object.entries(userValues).map(([fieldName, userValue]) =>
            tx.recognizedField.updateMany({
              where: { taskId: latestTask.id, fieldName },
              data: { userValue },
            }),
          ),
        );
      }

      return tx.medicalRecord.update({
        where: { id: recordId },
        data: {
          title: body.title,
          recordType: body.recordType,
          visitDate: body.visitDate ? new Date(body.visitDate) : null,
          institution: body.institution ?? null,
          healthConcern: body.healthConcern ?? null,
          reviewedAt,
        },
        include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
      });
    });
  }

  async archiveRecord(userId: string, recordId: string) {
    const record = await this.getRecord(userId, recordId);
    await this.assertCan(userId, record.memberId, "record.update");

    const now = new Date();
    return this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        status: MedicalRecordStatus.ARCHIVED,
        reviewedAt: record.reviewedAt ?? now,
        archivedAt: now,
      },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
  }

  async deleteRecord(userId: string, recordId: string) {
    const record = await this.getRecord(userId, recordId);
    await this.assertCan(userId, record.memberId, "record.update");

    const deletedRecord = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { status: MedicalRecordStatus.DELETED },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
    await Promise.all(deletedRecord.files.map((file) => this.fileStorage.delete(file.storagePath)));
    return deletedRecord;
  }

  async rerunRecognition(userId: string, recordId: string) {
    const record = await this.getRecord(userId, recordId);
    await this.assertCan(userId, record.memberId, "record.update");
    const file = record.files[0];
    if (!file) throw new BadRequestException("该资料没有原始文件，无法重新识别");

    const materialized = await this.fileStorage.materialize(file.storagePath);
    let recognition: RecognitionResult;
    try {
      recognition = await this.recognitionService.recognize({
        path: materialized.path,
        mimeType: file.mimeType,
        originalName: file.originalName,
      });
    } finally {
      await materialized.cleanup();
    }

    await this.prisma.recognitionTask.create({
      data: {
        recordId,
        engine: recognition.engine,
        rawText: recognition.rawText,
        fields: {
          create: recognition.fields.map((recognizedField) => ({
            fieldName: recognizedField.fieldName,
            fieldValue: recognizedField.fieldValue,
            sourceType: recognizedField.sourceType,
            sourceText: recognizedField.sourceText,
            confidence: recognizedField.confidence,
          })),
        },
      },
    });

    return this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        title: recognition.title,
        recordType: recognition.recordType,
        visitDate: recognition.visitDate ? new Date(recognition.visitDate) : null,
        institution: recognition.institution,
        healthConcern: recognition.healthConcern,
        status: MedicalRecordStatus.PENDING_REVIEW,
        reviewedAt: null,
        archivedAt: null,
        extractedFields: {
          source: recognition.engine,
          needsUserReview: true,
          title: recognition.title,
          recordType: recognition.recordType,
          visitDate: recognition.visitDate,
          institution: recognition.institution,
          healthConcern: recognition.healthConcern,
          originalName: file.originalName,
          fileHash: file.fileHash,
          storageProvider: this.storageProviderFor(file.storagePath),
          fields: recognition.fields,
        },
      },
      include: { files: true, recognitionTasks: { include: { fields: true }, orderBy: { createdAt: "desc" } } },
    });
  }

  private async prepareUploadedFiles(memberId: string, body: UploadRecordDto, files: Express.Multer.File[]) {
    const prepared: Array<{
      file: Express.Multer.File;
      originalName: string;
      fileHash: string;
      storedFile: { storagePath: string; storageProvider: "vercel_blob_private" | "aliyun_oss_private" | "local_disk" };
      recognition: RecognitionResult;
    }> = [];

    try {
      for (const file of files) {
        const originalName = this.decodeOriginalName(file.originalname);
        const fileHash = await this.hashFile(file.path);
        const recognition = await this.recognitionService.recognize({
          path: file.path,
          mimeType: file.mimetype,
          originalName,
          ...(body.title ? { title: body.title } : {}),
          ...(body.recordType ? { recordType: body.recordType } : {}),
          ...(body.visitDate ? { visitDate: body.visitDate } : {}),
          ...(body.institution ? { institution: body.institution } : {}),
          ...(body.healthConcern ? { healthConcern: body.healthConcern } : {}),
          ...(body.recognitionMode ? { recognitionMode: body.recognitionMode } : {}),
        });
        const storedFile = await this.fileStorage.store({
          memberId,
          localPath: file.path,
          originalName,
          mimeType: file.mimetype,
        });
        await this.cleanupUploadedTempFile(file.path);
        prepared.push({ file, originalName, fileHash, storedFile, recognition });
      }
      return prepared;
    } catch (error) {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
      throw error;
    }
  }

  private mergeRecognitions(recognitions: RecognitionResult[], originalNames: string[], body: UploadRecordDto): RecognitionResult {
    const best = [...recognitions].sort((a, b) => Number(b.reliable) - Number(a.reliable) || b.confidence - a.confidence || b.rawText.length - a.rawText.length)[0];
    if (!best) throw new BadRequestException("未能识别上传资料");
    if (recognitions.length === 1) return best;

    const rawText = recognitions.map((item, index) => `【第 ${index + 1} 份：${originalNames[index] ?? "原件"}】\n${item.rawText}`).join("\n\n");
    const pick = (key: keyof RecognitionResult) => {
      const manual = body[key as keyof UploadRecordDto] as string | undefined;
      if (manual) return manual;
      const found = recognitions.find((item) => {
        const value = item[key];
        return typeof value === "string" && value && value !== "未识别" && value !== "OTHER";
      });
      return (found?.[key] as string | null | undefined) ?? (best[key] as string | null);
    };

    const title = body.title ?? best.title;
    const recordType = pick("recordType") ?? best.recordType;
    const visitDate = pick("visitDate");
    const institution = pick("institution");
    const healthConcern = pick("healthConcern");
    const confidence = Math.max(...recognitions.map((item) => item.confidence));
    const sourceText = rawText.slice(0, 240);

    return {
      engine: `${Array.from(new Set(recognitions.map((item) => item.engine))).join("+")}+multi-file-v1`,
      title,
      recordType,
      visitDate,
      institution,
      healthConcern,
      rawText,
      reliable: recognitions.some((item) => item.reliable),
      confidence,
      message: `已合并 ${recognitions.length} 份原件，请按原件核对后保存。`,
      fields: [
        { fieldName: "title", fieldValue: title, sourceType: body.title ? "user_input" : "ocr_text", sourceText, confidence },
        { fieldName: "recordType", fieldValue: recordType, sourceType: body.recordType ? "user_input" : "ocr_text", sourceText, confidence },
        { fieldName: "visitDate", fieldValue: visitDate, sourceType: body.visitDate ? "user_input" : "ocr_text", sourceText, confidence },
        { fieldName: "institution", fieldValue: institution, sourceType: body.institution ? "user_input" : "ocr_text", sourceText, confidence },
        { fieldName: "healthConcern", fieldValue: healthConcern, sourceType: body.healthConcern ? "user_input" : "ocr_text", sourceText, confidence },
      ],
    };
  }

  private async getSelfMemberId(userId: string): Promise<string> {
    const profile = await this.prisma.memberProfile.findFirst({
      where: { subjectUserId: userId, subjectType: MemberSubjectType.SELF },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!profile) throw new NotFoundException("未找到本人健康档案");
    return profile.id;
  }

  private async assertCan(userId: string, memberId: string, action: "record.read" | "record.create" | "record.update") {
    const grant = await this.prisma.memberAccess.findUnique({
      where: { memberId_userId: { memberId, userId } },
    });

    if (
      !canAccessMember({
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
      })
    ) {
      throw new ForbiddenException("无权访问该成员资料");
    }
  }

  private async hashFile(path: string): Promise<string> {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  }

  private async cleanupUploadedTempFile(path: string): Promise<void> {
    await unlink(path).catch(() => undefined);
  }

  private storageProviderFor(storagePath: string): "vercel_blob_private" | "aliyun_oss_private" | "local_disk" {
    if (storagePath.startsWith("oss://")) return "aliyun_oss_private";
    return storagePath.startsWith("https://") ? "vercel_blob_private" : "local_disk";
  }

  private formatDate(value: Date | string | null): string | null {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private decodeOriginalName(name: string): string {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("�") ? name : decoded;
  }
}
