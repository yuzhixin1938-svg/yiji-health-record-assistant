import { Injectable, NotFoundException } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { PassThrough } from "node:stream";
import { MemberAccessService } from "../permissions/member-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { RecordFileStorageService } from "../records/record-file-storage.service.js";

@Injectable()
export class VisitPackPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
    private readonly fileStorage: RecordFileStorageService,
  ) {}

  async exportPdf(userId: string, packId: string): Promise<{ filename: string; buffer: Buffer }> {
    const pack = await this.prisma.visitPack.findUnique({ where: { id: packId } });
    if (!pack) throw new NotFoundException("未找到就诊资料包");
    await this.access.assertCan(userId, pack.memberId, "summary.manage");

    const content = (pack.content ?? {}) as VisitPackContent;
    const filename = `${sanitizeFilename(pack.title || "就诊资料包")}-${pack.id.slice(0, 8)}.pdf`;
    const attachments = await this.originalAttachments(pack.memberId, pack.selectedRecordIds, content);
    const buffer = await renderPdf(pack.title, content, attachments);
    return { filename, buffer };
  }

  private async originalAttachments(
    memberId: string,
    selectedRecordIds: unknown,
    content: VisitPackContent,
  ): Promise<{ images: ImageAttachment[]; pdfs: PdfAttachment[] }> {
    if (content.attachment?.includeOriginalFiles !== true || content.attachment.attachmentMode !== "embed_pdf") {
      return { images: [], pdfs: [] };
    }

    const recordIds = Array.isArray(selectedRecordIds)
      ? selectedRecordIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!recordIds.length) return { images: [], pdfs: [] };

    const records = await this.prisma.medicalRecord.findMany({
      where: {
        memberId,
        id: { in: recordIds },
      },
      include: { files: true },
      orderBy: { visitDate: "desc" },
    });

    const images: ImageAttachment[] = [];
    const pdfs: PdfAttachment[] = [];
    for (const record of records) {
      for (const file of record.files) {
        if (file.mimeType.startsWith("image/")) {
          images.push({
            recordTitle: record.title,
            originalName: file.originalName,
            content: await this.fileStorage.read(file.storagePath),
          });
          continue;
        }
        if (file.mimeType === "application/pdf") {
          pdfs.push({
            recordTitle: record.title,
            originalName: file.originalName,
          });
        }
      }
    }

    return { images, pdfs };
  }
}

type VisitPackContent = {
  attachment?: { includeOriginalFiles?: boolean; attachmentMode?: "none" | "embed_pdf" };
  member?: { displayName?: string; gender?: string | null; dateOfBirth?: string | Date | null };
  visitPurpose?: string | null;
  recentSymptoms?: string | null;
  questions?: string | null;
  relatedRecords?: Array<{
    title?: string;
    recordType?: string;
    visitDate?: string | Date | null;
    institution?: string | null;
    files?: Array<{ originalName?: string; fileHash?: string }>;
  }>;
};

type ImageAttachment = {
  recordTitle: string;
  originalName: string;
  content: Buffer;
};

type PdfAttachment = {
  recordTitle: string;
  originalName: string;
};

async function renderPdf(
  title: string,
  content: VisitPackContent,
  attachments: { images: ImageAttachment[]; pdfs: PdfAttachment[] } = { images: [], pdfs: [] },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    const font = resolveChineseFont();
    const regularFont = font ?? "Helvetica";
    const boldFont = font ?? "Helvetica-Bold";
    doc.font(regularFont);

    writeTitle(doc, title || "就诊资料包", boldFont);
    writeText(doc, `生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
    writeText(doc, "说明：本资料包只整理用户上传和填写的信息，不替代原始病历，不构成诊断、治疗或用药建议。");

    section(doc, boldFont, "1. 就诊目的");
    writeText(doc, text(content.visitPurpose, "未填写"));

    section(doc, boldFont, "2. 近期情况");
    writeText(doc, text(displayRecentSymptoms(content.recentSymptoms), "未填写"));

    section(doc, boldFont, "3. 就医时间线");
    list(doc, content.relatedRecords ?? [], (record) => `${formatDate(record.visitDate)} · ${text(record.title, "未命名资料")} · ${text(record.recordType, "资料")}`);

    section(doc, boldFont, "4. 关键资料清单");
    list(doc, content.relatedRecords ?? [], (record) => `${text(record.title, "未命名资料")} · ${text(record.institution, "未填写机构")}`);

    section(doc, boldFont, "5. 想问医生的问题");
    writeText(doc, text(content.questions, "未填写"));

    section(doc, boldFont, "6. 附件清单");
    const includeOriginals = !String(content.recentSymptoms ?? "").includes("不附原始资料清单");
    if (!includeOriginals) {
      writeText(doc, "本次只导出整理摘要，不附原始资料清单。");
    } else {
      const files = (content.relatedRecords ?? []).flatMap((record) => record.files ?? []);
      list(doc, files, (file) => text(file.originalName, "未命名文件"));
    }

    if (attachments.images.length) {
      section(doc, boldFont, "7. 原始图片资料");
      for (const attachment of attachments.images) {
        doc.addPage();
        doc.font(boldFont).fontSize(14).fillColor("#17735f").text(text(attachment.recordTitle, "病历资料"));
        doc.font(regularFont).fontSize(10).fillColor("#747f79").text(text(attachment.originalName, "原始图片")).moveDown(0.5);
        const fit: [number, number] = [
          doc.page.width - doc.page.margins.left - doc.page.margins.right,
          doc.page.height - 160,
        ];
        doc.image(attachment.content, {
          fit,
          align: "center",
        });
      }
    }

    if (attachments.pdfs.length) {
      section(doc, boldFont, "8. 原始 PDF 资料说明");
      for (const attachment of attachments.pdfs) {
        ensureSpace(doc, 110);
        doc.moveDown(0.2);
        doc.font(boldFont).fontSize(13).fillColor("#17735f").text(text(attachment.recordTitle, "病历资料"));
        doc.font(regularFont).fontSize(10.5).fillColor("#20322c").text(`原始文件：${text(attachment.originalName, "原始 PDF")}`).moveDown(0.3);
        doc.text("说明：当前版本不把 PDF 原件直接拼接进资料包正文，而是保留为独立原件。你可以在病历资料页打开原件查看，导出时也会保留在附件清单中。");
      }
    }

    addPageNumbers(doc, regularFont);
    doc.end();
  });
}

function writeTitle(doc: PDFKit.PDFDocument, title: string, boldFont: string) {
  doc.font(boldFont).fontSize(22).text(title).moveDown(0.8);
}

function section(doc: PDFKit.PDFDocument, boldFont: string, title: string) {
  ensureSpace(doc, 80);
  doc.moveDown(0.7).font(boldFont).fontSize(15).fillColor("#17735f").text(title).fillColor("#20322c").moveDown(0.3);
}

function writeText(doc: PDFKit.PDFDocument, value: string) {
  ensureSpace(doc, 42);
  doc.fontSize(10.5).fillColor("#20322c").text(value, { lineGap: 4 }).moveDown(0.25);
}

function list<T>(doc: PDFKit.PDFDocument, items: T[], render: (item: T) => string) {
  if (!items.length) {
    writeText(doc, "暂无记录");
    return;
  }
  for (const item of items) writeText(doc, `- ${render(item)}`);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function addPageNumbers(doc: PDFKit.PDFDocument, regularFont: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font(regularFont).fontSize(9).fillColor("#747f79").text(`第 ${i + 1} 页 / 共 ${range.count} 页`, 48, doc.page.height - 36, {
      align: "center",
    });
  }
}

function text(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function displayRecentSymptoms(value: string | null | undefined) {
  return String(value ?? "").split("\n\n原始资料：")[0];
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "未填写";
  return new Date(value).toISOString().slice(0, 10);
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

function resolveChineseFont() {
  const candidates = [
    "C:\\Windows\\Fonts\\simhei.ttf",
    "C:\\Windows\\Fonts\\msyh.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}
