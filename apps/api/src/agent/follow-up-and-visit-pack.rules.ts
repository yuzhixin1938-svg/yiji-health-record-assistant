import { createAgentTodoSuggestion, type AgentRule } from "./agent-rule.service.js";

const FOLLOW_UP_REMINDER_WINDOW_DAYS = 7;

export const followUpApproachingRule: AgentRule = ({ state }) => {
  if (!state.followUpAt) return [];

  const followUpAt = new Date(state.followUpAt);
  if (Number.isNaN(followUpAt.getTime())) return [];

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + FOLLOW_UP_REMINDER_WINDOW_DAYS);

  if (followUpAt < startOfToday(now) || followUpAt > windowEnd) return [];

  return [
    createAgentTodoSuggestion({
      type: "FOLLOW_UP",
      title: "复诊前整理资料",
      dueAt: followUpAt,
      sourceType: "member_profile",
      sourceId: state.memberId,
      rule: "follow_up.approaching",
      suggestedAction: "prepare_visit_pack",
    }),
  ];
};

export const visitPackRecentStatusRule: AgentRule = ({ state }) => {
  return (state.visitPacks ?? []).flatMap((pack) => {
    if (hasValue(pack.recentSymptoms)) return [];

    return [
      createAgentTodoSuggestion({
        type: "VISIT_PACK",
        title: "补充近期情况",
        sourceType: "visit_pack",
        sourceId: pack.id,
        rule: "visit_pack.recent_status_missing",
        suggestedAction: "add_recent_status",
      }),
    ];
  });
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function startOfToday(now: Date): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}
