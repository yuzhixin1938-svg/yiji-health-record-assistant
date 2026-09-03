import { createAgentTodoSuggestion, type AgentRule } from "./agent-rule.service.js";

const REQUIRED_RECORD_FIELDS = [
  { key: "visitDate", label: "就诊日期" },
  { key: "healthConcern", label: "分类" },
  { key: "institution", label: "医院或机构" },
] as const;

export const recordCompletenessRule: AgentRule = ({ state }) => {
  return (state.records ?? []).flatMap((record) => {
    const missingFields = REQUIRED_RECORD_FIELDS.filter(({ key }) => !hasValue(record[key])).map(
      ({ label }) => label,
    );

    if (missingFields.length === 0) return [];

    return [
      createAgentTodoSuggestion({
        type: "REVIEW_RECORD",
        title: `补全「${record.title || "病历资料"}」`,
        sourceType: "medical_record",
        sourceId: record.id,
        rule: "record.fields.incomplete",
        suggestedAction: "review_record_fields",
        missingFields,
      }),
    ];
  });
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}
