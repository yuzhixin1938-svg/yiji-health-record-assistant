import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFParse, VerbosityLevel } from "pdf-parse";
import { VisitPackPdfService } from "../src/visit-packs/visit-pack-pdf.service.js";

describe("visit pack PDF pdf attachments", () => {
  it("adds an explanation page for PDF originals instead of silently failing", async () => {
    const prisma = {
      visitPack: {
        findUnique: async () => ({
          id: "pack-a",
          memberId: "member-a",
          title: "复诊资料包",
          selectedRecordIds: ["record-a"],
          content: {
            attachment: { includeOriginalFiles: true, attachmentMode: "embed_pdf" },
            visitPurpose: "复查",
            relatedRecords: [{ title: "检查报告", files: [{ originalName: "报告原件.pdf" }] }],
          },
        }),
      },
      medicalRecord: {
        findMany: async () => [
          {
            id: "record-a",
            title: "检查报告",
            visitDate: new Date("2026-08-01T00:00:00.000Z"),
            files: [
              {
                originalName: "报告原件.pdf",
                mimeType: "application/pdf",
                storagePath: "oss://bucket/report.pdf",
              },
            ],
          },
        ],
      },
    };
    const access = { assertCan: async () => undefined };
    const storage = {
      read: async () => {
        throw new Error("should not read pdf originals for embed_pdf fallback");
      },
    };

    const result = await new VisitPackPdfService(prisma as never, access as never, storage as never).exportPdf(
      "user-a",
      "pack-a",
    );

    const parser = new PDFParse({ data: result.buffer, verbosity: VerbosityLevel.ERRORS });
    const parsed = await parser.getText();

    assert.match(parsed.text, /原始 PDF 资料说明/);
    assert.match(parsed.text, /报告原件\.pdf/);
    assert.match(parsed.text, /当前版本不把 PDF 原件直接拼接进资料包正文/);
  });
});
