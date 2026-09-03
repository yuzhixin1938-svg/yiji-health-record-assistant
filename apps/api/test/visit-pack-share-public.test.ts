import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256 } from "../src/auth/token-utils.js";
import { VisitPacksService } from "../src/visit-packs/visit-packs.service.js";

function service(share: unknown) {
  const updates: unknown[] = [];
  const prisma = {
    visitPackShare: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        assert.equal(where.tokenHash, sha256("plain-token"));
        return share;
      },
      update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
        updates.push({ where, data });
        return { id: where.id };
      },
    },
  };
  return { visitPacks: new VisitPacksService(prisma as never, {} as never), updates };
}

function validShare(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-a",
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    visitPack: {
      id: "pack-a",
      title: "复诊资料包",
      visitReason: "复查牙齿",
      recentSymptoms: "最近疼痛减轻",
      questions: "是否需要继续复诊",
      status: "GENERATED",
      content: { timeline: [] },
      generatedAt: new Date("2026-08-07T00:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("public visit pack share access", () => {
  it("returns a shared visit pack preview and records access", async () => {
    const { visitPacks, updates } = service(validShare());

    const result = await visitPacks.getSharedPack("plain-token");

    assert.equal(result.id, "pack-a");
    assert.equal(result.title, "复诊资料包");
    assert.equal(result.share.id, "share-a");
    assert.equal(updates.length, 1);
    assert.deepEqual((updates[0] as { where: { id: string } }).where, { id: "share-a" });
  });

  it("rejects invalid tokens", async () => {
    const { visitPacks } = service(null);

    await assert.rejects(() => visitPacks.getSharedPack("plain-token"), /分享链接不存在或已失效/);
  });

  it("rejects revoked shares", async () => {
    const { visitPacks } = service(validShare({ revokedAt: new Date() }));

    await assert.rejects(() => visitPacks.getSharedPack("plain-token"), /分享链接不存在或已失效/);
  });

  it("rejects expired shares", async () => {
    const { visitPacks } = service(validShare({ expiresAt: new Date(Date.now() - 1_000) }));

    await assert.rejects(() => visitPacks.getSharedPack("plain-token"), /分享链接不存在或已失效/);
  });
});
