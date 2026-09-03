export type AgentTodoRule =
  | "record.fields.incomplete"
  | "follow_up.approaching"
  | "visit_pack.prepare"
  | "visit_pack.recent_status_missing";

export type AgentTodoSourceType = "medical_record" | "visit_pack" | "member_profile";

export type AgentSuggestedAction =
  | "review_record_fields"
  | "prepare_visit_pack"
  | "add_recent_status"
  | "upload_follow_up_report";

export type AgentTodoMetadata = {
  rule: AgentTodoRule;
  sourceType: AgentTodoSourceType;
  sourceId: string;
  suggestedAction: AgentSuggestedAction;
  missingFields?: string[];
};

export function createAgentTodoMetadata(input: AgentTodoMetadata): AgentTodoMetadata {
  return {
    rule: input.rule,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    suggestedAction: input.suggestedAction,
    ...(input.missingFields?.length ? { missingFields: input.missingFields } : {}),
  };
}
