import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { describe, it } from "node:test";
import { sha256 } from "../src/auth/token-utils.js";
import { VisitPacksService } from "../src/visit-packs/visit-packs.service.js";

function service(options: { allow?: boolean; pack?: { id: string; memberId: string } | null } = {}) {
  const createdShares: unknown[] = [];
  const prisma = {
    visitPack: {
      findUnique: async () => options.pack ?? { id: "pack-a", memberId: "member-a" },
    },
    visitPackShare: {
      create: async ({ data }: { data: { visitPackId: string; tokenHash: string; expiresAt: Date } }) => {
        createdShares.push(data);
        return {
          id: "share-a",
          visitPackId: data.visitPackId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          accessCount: 0,
          lastAccessedAt: null,
        };
      },
    },
  };
  const access = {
    resolveMemberId: async (_userId: string, memberId?: string) => memberId ?? "member-a",
    assertCan: async () => {
      if (options.allow === false) throw new ForbiddenException("无权访问该成员资料");
    },
  };
  return { visitPacks: new VisitPacksService(prisma as never, access as never), createdShares };
}

describe("visit pack share creation", () => {
  it("creates an expiring share for an authorized user without storing the plain token", async () => {
    const { visitPacks, createdShares } = service();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

    const share = await visitPacks.createShare("user-a", "pack-a", { expiresAt });

    assert.equal(share.id, "share-a");
    assert.equal(share.visitPackId, "pack-a");
    assert.match(share.token, /^[A-Za-z0-9_-]+$/);
    assert.equal(share.sharePath, `/share/visit-pack/${share.token}`);
    assert.equal(createdShares.length, 1);
    assert.equal((createdShares[0] as { tokenHash: string }).tokenHash, sha256(share.token));
    assert.notEqual((createdShares[0] as { tokenHash: string }).tokenHash, share.token);
  });

  it("rejects unauthorized users", async () => {
    const { visitPacks } = service({ allow: false });
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

    await assert.rejects(() => visitPacks.createShare("user-b", "pack-a", { expiresAt }), /无权访问/);
  });

  it("rejects shares that expire in the past", async () => {
    const { visitPacks } = service();
    const expiresAt = new Date(Date.now() - 1_000).toISOString();

    await assert.rejects(() => visitPacks.createShare("user-a", "pack-a", { expiresAt }), /分享有效期/);
  });
});
