import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VisitPackPdfService } from "../src/visit-packs/visit-pack-pdf.service.js";

const onePixelJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAARD/2gAIAQEAAT8QH//Z",
  "base64",
);

describe("visit pack PDF image attachments", () => {
  it("embeds selected image originals when attachment mode is embed_pdf", async () => {
    const reads: string[] = [];
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
            relatedRecords: [{ title: "牙科病历", files: [{ originalName: "牙片.png" }] }],
          },
        }),
      },
      medicalRecord: {
        findMany: async () => [
          {
            id: "record-a",
            title: "牙科病历",
            visitDate: new Date("2026-08-01T00:00:00.000Z"),
            files: [
              {
                originalName: "牙片.jpg",
                mimeType: "image/jpeg",
                storagePath: "oss://bucket/record-a.jpg",
              },
            ],
          },
        ],
      },
    };
    const access = { assertCan: async () => undefined };
    const storage = {
      read: async (storagePath: string) => {
        reads.push(storagePath);
        return onePixelJpeg;
      },
    };

    const result = await new VisitPackPdfService(prisma as never, access as never, storage as never).exportPdf(
      "user-a",
      "pack-a",
    );

    assert.equal(result.filename, "复诊资料包-pack-a.pdf");
    assert.equal(result.buffer.subarray(0, 4).toString(), "%PDF");
    assert.deepEqual(reads, ["oss://bucket/record-a.jpg"]);
  });

  it("does not read originals when attachment mode is disabled", async () => {
    const prisma = {
      visitPack: {
        findUnique: async () => ({
          id: "pack-a",
          memberId: "member-a",
          title: "复诊资料包",
          selectedRecordIds: ["record-a"],
          content: { attachment: { includeOriginalFiles: false, attachmentMode: "none" } },
        }),
      },
    };
    const access = { assertCan: async () => undefined };
    const storage = {
      read: async () => {
        throw new Error("should not read original files");
      },
    };

    const result = await new VisitPackPdfService(prisma as never, access as never, storage as never).exportPdf(
      "user-a",
      "pack-a",
    );

    assert.equal(result.buffer.subarray(0, 4).toString(), "%PDF");
  });
});
