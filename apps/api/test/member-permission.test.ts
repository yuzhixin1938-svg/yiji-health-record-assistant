import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessMember,
  type MemberGrant,
  type PermissionContext,
} from "../src/permissions/member-permission.js";

const activeManager: MemberGrant = {
  memberId: "member-a",
  userId: "user-a",
  role: "MANAGER",
  status: "ACTIVE",
  expiresAt: null,
};

function context(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    actorUserId: "user-a",
    resourceMemberId: "member-a",
    action: "record.read",
    grant: activeManager,
    now: new Date("2026-07-04T00:00:00.000Z"),
    ...overrides,
  };
}

describe("member permission", () => {
  it("denies by default when no grant exists", () => {
    assert.equal(canAccessMember(context({ grant: null })), false);
  });

  it("rejects cross-member resource access", () => {
    assert.equal(canAccessMember(context({ resourceMemberId: "member-b" })), false);
  });

  it("rejects a grant belonging to another user", () => {
    assert.equal(canAccessMember(context({ actorUserId: "user-b" })), false);
  });

  it("rejects revoked and expired grants", () => {
    assert.equal(
      canAccessMember(context({ grant: { ...activeManager, status: "REVOKED" } })),
      false,
    );
    assert.equal(
      canAccessMember(
        context({ grant: { ...activeManager, expiresAt: new Date("2026-07-03T00:00:00.000Z") } }),
      ),
      false,
    );
  });

  it("allows managers to share authorized member data", () => {
    assert.equal(canAccessMember(context({ action: "share.create" })), true);
  });

  it("allows contributors to edit records but not export members", () => {
    const contributor = { ...activeManager, role: "CONTRIBUTOR" as const };
    assert.equal(canAccessMember(context({ grant: contributor, action: "record.update" })), true);
    assert.equal(canAccessMember(context({ grant: contributor, action: "member.export" })), false);
  });

  it("keeps original files hidden from viewers unless explicitly enabled", () => {
    const viewer = { ...activeManager, role: "VIEWER" as const };
    assert.equal(
      canAccessMember(context({ grant: viewer, action: "record.original.read" })),
      false,
    );
    assert.equal(
      canAccessMember(
        context({
          grant: viewer,
          action: "record.original.read",
          viewerCanReadOriginal: true,
        }),
      ),
      true,
    );
  });

  it("requires an active support ticket for temporary support access", () => {
    const support = { ...activeManager, role: "SUPPORT" as const };
    assert.equal(canAccessMember(context({ grant: support })), false);
    assert.equal(
      canAccessMember(context({ grant: support, supportTicketActive: true })),
      true,
    );
    assert.equal(
      canAccessMember(
        context({ grant: support, supportTicketActive: true, action: "record.original.read" }),
      ),
      false,
    );
  });
});
