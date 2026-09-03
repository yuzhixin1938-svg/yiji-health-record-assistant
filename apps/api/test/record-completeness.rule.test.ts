import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordCompletenessRule } from "../src/agent/record-completeness.rule.js";

describe("record completeness rule", () => {
  it("creates a review todo when record fields are missing", () => {
    const suggestions = recordCompletenessRule({
      state: {
        memberId: "member-a",
        records: [
          {
            id: "record-a",
            title: "牙科病历",
            visitDate: null,
            institution: "",
            healthConcern: "牙齿",
          },
        ],
      },
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0]?.type, "REVIEW_RECORD");
    assert.equal(suggestions[0]?.title, "补全「牙科病历」");
    assert.equal(suggestions[0]?.sourceType, "medical_record");
    assert.equal(suggestions[0]?.sourceId, "record-a");
    assert.deepEqual(suggestions[0]?.metadata, {
      rule: "record.fields.incomplete",
      sourceType: "medical_record",
      sourceId: "record-a",
      suggestedAction: "review_record_fields",
      missingFields: ["就诊日期", "医院或机构"],
    });
  });

  it("does not create a todo when required fields are complete", () => {
    const suggestions = recordCompletenessRule({
      state: {
        memberId: "member-a",
        records: [
          {
            id: "record-a",
            title: "体检报告",
            visitDate: "2026-08-01",
            institution: "社区医院",
            healthConcern: "体检",
          },
        ],
      },
    });

    assert.deepEqual(suggestions, []);
  });
});
