import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentRuleService,
  createAgentTodoSuggestion,
  type AgentRule,
} from "../src/agent/agent-rule.service.js";

describe("agent rule service", () => {
  it("accepts member state and returns no suggestions when no rules are registered", () => {
    const service = new AgentRuleService();

    assert.deepEqual(service.suggestTodos({ memberId: "member-a" }), []);
  });

  it("runs registered rules without writing to storage", () => {
    let calls = 0;
    const rule: AgentRule = ({ state }) => {
      calls += 1;
      return [
        createAgentTodoSuggestion({
          type: "REVIEW_RECORD",
          title: "核对刚上传的资料",
          sourceType: "medical_record",
          sourceId: state.records?.[0]?.id ?? "record-a",
          rule: "record.fields.incomplete",
          suggestedAction: "review_record_fields",
        }),
      ];
    };
    const service = new AgentRuleService([rule]);

    const suggestions = service.suggestTodos({
      memberId: "member-a",
      records: [{ id: "record-a" }],
    });

    assert.equal(calls, 1);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0]?.sourceId, "record-a");
  });

  it("can combine suggestions from three rules", () => {
    const rules: AgentRule[] = [
      () => [
        createAgentTodoSuggestion({
          type: "REVIEW_RECORD",
          title: "补全病历资料",
          sourceType: "medical_record",
          sourceId: "record-a",
          rule: "record.fields.incomplete",
          suggestedAction: "review_record_fields",
        }),
      ],
      () => [
        createAgentTodoSuggestion({
          type: "FOLLOW_UP",
          title: "准备复诊资料",
          sourceType: "member_profile",
          sourceId: "member-a",
          rule: "follow_up.approaching",
          suggestedAction: "prepare_visit_pack",
        }),
      ],
      () => [
        createAgentTodoSuggestion({
          type: "VISIT_PACK",
          title: "补充近期情况",
          sourceType: "visit_pack",
          sourceId: "pack-a",
          rule: "visit_pack.recent_status_missing",
          suggestedAction: "add_recent_status",
        }),
      ],
    ];
    const service = new AgentRuleService(rules);

    const suggestions = service.suggestTodos({ memberId: "member-a" });

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.metadata.rule),
      ["record.fields.incomplete", "follow_up.approaching", "visit_pack.recent_status_missing"],
    );
  });
});
