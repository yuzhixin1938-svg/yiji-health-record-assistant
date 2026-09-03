import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemberAccessRole } from "../src/generated/prisma/enums.js";
import { FamilyService } from "../src/family/family.service.js";

const disabledMessage = /第一版暂不支持跨账号家庭邀请或授权/;

function service() {
  return new FamilyService({} as never);
}

describe("cross-account family access", () => {
  it("disables invitation creation in v1", async () => {
    await assert.rejects(
      () => service().createInvitation("user-a", "member-a", { role: MemberAccessRole.MANAGER }),
      disabledMessage,
    );
  });

  it("disables invitation acceptance in v1", async () => {
    await assert.rejects(() => service().acceptInvitation("user-b", "token"), disabledMessage);
  });

  it("disables member access listing in v1", async () => {
    await assert.rejects(() => service().listMemberAccess("user-a", "member-a"), disabledMessage);
  });

  it("disables member access updates in v1", async () => {
    await assert.rejects(
      () => service().updateMemberAccess("user-a", "member-a", "user-b", { role: MemberAccessRole.MANAGER }),
      disabledMessage,
    );
  });
});
