import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSync } from "class-validator";
import { CreateVisitPackDto } from "../src/visit-packs/visit-packs.dto.js";
import { VisitPacksService } from "../src/visit-packs/visit-packs.service.js";

function dto(input: Partial<CreateVisitPackDto>) {
  return Object.assign(new CreateVisitPackDto(), {
    title: "复诊资料包",
    visitReason: "复查",
    selectedRecordIds: ["record-a"],
    ...input,
  });
}

function service(created: unknown[]) {
  const prisma = {
    visitPack: {
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: "pack-a", ...(data as object) };
      },
    },
  };
  const access = {
    resolveMemberId: async () => "member-a",
    assertCan: async () => undefined,
  };
  return new VisitPacksService(prisma as never, access as never);
}

describe("visit pack attachment options", () => {
  it("accepts embed_pdf attachment mode", () => {
    const errors = validateSync(dto({ includeOriginalFiles: true, attachmentMode: "embed_pdf" }));

    assert.equal(errors.length, 0);
  });

  it("rejects unsupported attachment mode", () => {
    const errors = validateSync(dto({ includeOriginalFiles: true, attachmentMode: "zip" as never }));

    assert.equal(errors.length > 0, true);
  });

  it("stores attachment options when creating a visit pack", async () => {
    const created: unknown[] = [];
    await service(created).create("user-a", dto({ includeOriginalFiles: true, attachmentMode: "embed_pdf" }));

    assert.deepEqual((created[0] as { content: unknown }).content, {
      attachment: {
        includeOriginalFiles: true,
        attachmentMode: "embed_pdf",
      },
    });
  });
});
