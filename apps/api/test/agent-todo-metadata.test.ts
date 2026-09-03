import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentTodoMetadata } from "../src/todos/agent-todo-metadata.js";

describe("agent todo metadata", () => {
  it("keeps the rule, source and suggested action needed for traceable todos", () => {
    const metadata = createAgentTodoMetadata({
      rule: "record.fields.incomplete",
      sourceType: "medical_record",
      sourceId: "record-a",
      suggestedAction: "review_record_fields",
      missingFields: ["visitDate", "institution"],
    });

    assert.deepEqual(metadata, {
      rule: "record.fields.incomplete",
      sourceType: "medical_record",
      sourceId: "record-a",
      suggestedAction: "review_record_fields",
      missingFields: ["visitDate", "institution"],
    });
  });

  it("omits empty missing fields to keep metadata compact", () => {
    const metadata = createAgentTodoMetadata({
      rule: "visit_pack.prepare",
      sourceType: "member_profile",
      sourceId: "member-a",
      suggestedAction: "prepare_visit_pack",
      missingFields: [],
    });

    assert.equal("missingFields" in metadata, false);
  });
});
