import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VisitPacksService } from "../src/visit-packs/visit-packs.service.js";

function service(options: {
  pack?: { id: string; memberId: string; createdById: string } | null;
  share?: { id: string; visitPackId: string; revokedAt: Date | null } | null;
} = {}) {
  const updates: unknown[] = [];
  const prisma = {
    visitPack: {
      findUnique: async () =>
        options.pack ?? {
          id: "pack-a",
          memberId: "member-a",
          createdById: "user-a",
        },
    },
    visitPackShare: {
      findUnique: async () =>
        options.share ?? {
          id: "share-a",
          visitPackId: "pack-a",
          revokedAt: null,
        },
      update: async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        updates.push({ where, data });
        return { id: where.id, visitPackId: "pack-a", ...data };
      },
    },
  };
  const access = {
    resolveMemberId: async (_userId: string, memberId?: string) => memberId ?? "member-a",
    assertCan: async () => undefined,
  };
  return { visitPacks: new VisitPacksService(prisma as never, access as never), updates };
}

describe("visit pack share revoke", () => {
  it("revokes a share when the current user created the pack", async () => {
    const { visitPacks, updates } = service();

    const share = await visitPacks.revokeShare("user-a", "pack-a", "share-a");

    assert.equal(share.id, "share-a");
    assert.ok(share.revokedAt instanceof Date);
    assert.deepEqual((updates[0] as { where: { id: string } }).where, { id: "share-a" });
  });

  it("rejects users who did not create the pack", async () => {
    const { visitPacks } = service({
      pack: { id: "pack-a", memberId: "member-a", createdById: "user-a" },
    });

    await assert.rejects(() => visitPacks.revokeShare("user-b", "pack-a", "share-a"), /只有资料包创建者/);
  });

  it("does not revoke a share from another pack", async () => {
    const { visitPacks } = service({
      share: { id: "share-a", visitPackId: "pack-b", revokedAt: null },
    });

    await assert.rejects(() => visitPacks.revokeShare("user-a", "pack-a", "share-a"), /未找到分享链接/);
  });

  it("returns an already revoked share without updating it again", async () => {
    const revokedAt = new Date("2026-08-07T00:00:00.000Z");
    const { visitPacks, updates } = service({
      share: { id: "share-a", visitPackId: "pack-a", revokedAt },
    });

    const share = await visitPacks.revokeShare("user-a", "pack-a", "share-a");

    assert.equal(share.revokedAt, revokedAt);
    assert.equal(updates.length, 0);
  });
});
