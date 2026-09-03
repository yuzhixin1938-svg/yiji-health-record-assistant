import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  followUpApproachingRule,
  visitPackRecentStatusRule,
} from "../src/agent/follow-up-and-visit-pack.rules.js";

describe("follow-up approaching rule", () => {
  it("creates a todo when follow-up is within seven days", () => {
    const followUpAt = new Date();
    followUpAt.setDate(followUpAt.getDate() + 3);

    const suggestions = followUpApproachingRule({
      state: { memberId: "member-a", followUpAt },
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0]?.type, "FOLLOW_UP");
    assert.equal(suggestions[0]?.title, "复诊前整理资料");
    assert.deepEqual(suggestions[0]?.metadata, {
      rule: "follow_up.approaching",
      sourceType: "member_profile",
      sourceId: "member-a",
      suggestedAction: "prepare_visit_pack",
    });
  });

  it("does not create a todo when follow-up is outside the reminder window", () => {
    const followUpAt = new Date();
    followUpAt.setDate(followUpAt.getDate() + 10);

    const suggestions = followUpApproachingRule({
      state: { memberId: "member-a", followUpAt },
    });

    assert.deepEqual(suggestions, []);
  });
});

describe("visit pack recent status rule", () => {
  it("creates a todo when recent status is missing", () => {
    const suggestions = visitPackRecentStatusRule({
      state: {
        memberId: "member-a",
        visitPacks: [{ id: "pack-a", recentSymptoms: "  " }],
      },
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0]?.type, "VISIT_PACK");
    assert.equal(suggestions[0]?.title, "补充近期情况");
    assert.deepEqual(suggestions[0]?.metadata, {
      rule: "visit_pack.recent_status_missing",
      sourceType: "visit_pack",
      sourceId: "pack-a",
      suggestedAction: "add_recent_status",
    });
  });

  it("does not create a todo when recent status exists", () => {
    const suggestions = visitPackRecentStatusRule({
      state: {
        memberId: "member-a",
        visitPacks: [{ id: "pack-a", recentSymptoms: "最近一周疼痛减轻" }],
      },
    });

    assert.deepEqual(suggestions, []);
  });
});
