import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { diskStorage } from "multer";
import type { Response } from "express";
import { AuditService } from "../audit/audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { RecordsService } from "./records.service.js";
import { CreateManualRecordDto, ReviewRecordDto, UploadRecordDto } from "./records.dto.js";

const uploadDir = process.env.VERCEL ? join(tmpdir(), "yiji-medical-records") : join(process.cwd(), "storage", "medical-records");
mkdirSync(uploadDir, { recursive: true });

@UseGuards(AuthGuard)
@Controller("records")
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async listRecords(@Req() request: AuthenticatedRequest, @Query("memberId") memberId?: string) {
    return this.recordsService.listRecords(request.user.id, memberId);
  }

  @Get("timeline")
  async timeline(
    @Req() request: AuthenticatedRequest,
    @Query("memberId") memberId?: string,
    @Query("healthConcern") healthConcern?: string,
  ) {
    return this.recordsService.timeline(request.user.id, memberId, healthConcern);
  }

  @Get(":recordId")
  async getRecord(@Req() request: AuthenticatedRequest, @Param("recordId") recordId: string) {
    return this.recordsService.getRecord(request.user.id, recordId);
  }

  @Get(":recordId/recognition")
  async getRecognition(@Req() request: AuthenticatedRequest, @Param("recordId") recordId: string) {
    return this.recordsService.getRecognition(request.user.id, recordId);
  }

  @Post()
  async createManualRecord(@Req() request: AuthenticatedRequest, @Body() body: CreateManualRecordDto) {
    const record = await this.recordsService.createManualRecord(request.user.id, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.manual.create",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
    });
    return record;
  }

  @Get(":recordId/files/:fileId/original")
  async getOriginalFile(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Param("recordId") recordId: string,
    @Param("fileId") fileId: string,
  ) {
    const result = await this.recordsService.getOriginalFile(request.user.id, recordId, fileId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: result.memberId,
      action: "record.original.read",
      resourceType: "medical_record_file",
      resourceId: fileId,
      requestId: request.requestId,
    });

    response.setHeader("Content-Type", result.file.mimeType);
    response.setHeader("Content-Length", String(result.content.byteLength));
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`);
    response.send(result.content);
  }

  @Post("upload")
  @UseInterceptors(
    FileFieldsInterceptor([{ name: "file", maxCount: 1 }, { name: "files", maxCount: 12 }], {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_request, file, callback) => {
          callback(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async uploadRecord(
    @Req() request: AuthenticatedRequest,
    @Body() body: UploadRecordDto,
    @UploadedFiles() upload?: { file?: Express.Multer.File[]; files?: Express.Multer.File[] },
  ) {
    const files = [...(upload?.files ?? []), ...(upload?.file ?? [])];
    const record = await this.recordsService.uploadRecord(request.user.id, body, files);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.upload",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
      metadata: { fileCount: record.files.length },
    });
    return record;
  }

  @Post(":recordId/files")
  @UseInterceptors(
    FileFieldsInterceptor([{ name: "file", maxCount: 1 }, { name: "files", maxCount: 12 }], {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_request, file, callback) => {
          callback(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async addRecordFiles(
    @Req() request: AuthenticatedRequest,
    @Param("recordId") recordId: string,
    @Body() body: UploadRecordDto,
    @UploadedFiles() upload?: { file?: Express.Multer.File[]; files?: Express.Multer.File[] },
  ) {
    const files = [...(upload?.files ?? []), ...(upload?.file ?? [])];
    const record = await this.recordsService.addRecordFiles(request.user.id, recordId, body, files);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.files.add",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
      metadata: { addedFileCount: files.length },
    });
    return record;
  }

  @Post("recognition/test")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_request, file, callback) => {
          callback(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async testRecognition(
    @Req() request: AuthenticatedRequest,
    @Body() body: UploadRecordDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.recordsService.testRecognition(request.user.id, body, file);
    await this.audit.record({
      actorUserId: request.user.id,
      action: "record.recognition.test",
      resourceType: "medical_record_file",
      requestId: request.requestId,
      metadata: { mimeType: result.mimeType, sizeBytes: result.sizeBytes },
    });
    return result;
  }

  @Patch(":recordId/review")
  async reviewRecord(
    @Req() request: AuthenticatedRequest,
    @Param("recordId") recordId: string,
    @Body() body: ReviewRecordDto,
  ) {
    const record = await this.recordsService.reviewRecord(request.user.id, recordId, body);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.review",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
    });
    return record;
  }

  @Post(":recordId/archive")
  async archiveRecord(@Req() request: AuthenticatedRequest, @Param("recordId") recordId: string) {
    const record = await this.recordsService.archiveRecord(request.user.id, recordId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.archive",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
    });
    return record;
  }

  @Delete(":recordId")
  async deleteRecord(@Req() request: AuthenticatedRequest, @Param("recordId") recordId: string) {
    const record = await this.recordsService.deleteRecord(request.user.id, recordId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.delete",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
    });
    return { ok: true };
  }

  @Post(":recordId/recognition/rerun")
  async rerunRecognition(@Req() request: AuthenticatedRequest, @Param("recordId") recordId: string) {
    const record = await this.recordsService.rerunRecognition(request.user.id, recordId);
    await this.audit.record({
      actorUserId: request.user.id,
      memberId: record.memberId,
      action: "record.recognition.rerun",
      resourceType: "medical_record",
      resourceId: record.id,
      requestId: request.requestId,
    });
    return record;
  }
}
