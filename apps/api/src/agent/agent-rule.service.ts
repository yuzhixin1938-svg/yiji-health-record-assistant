import { Injectable } from "@nestjs/common";
import type {
  AgentSuggestedAction,
  AgentTodoMetadata,
  AgentTodoRule,
  AgentTodoSourceType,
} from "../todos/agent-todo-metadata.js";
import { createAgentTodoMetadata } from "../todos/agent-todo-metadata.js";

export type AgentRecordState = {
  id: string;
  title?: string | null;
  visitDate?: Date | string | null;
  institution?: string | null;
  healthConcern?: string | null;
  status?: string | null;
};

export type AgentVisitPackState = {
  id: string;
  visitReason?: string | null;
  recentSymptoms?: string | null;
  status?: string | null;
};

export type AgentMemberState = {
  memberId: string;
  records?: AgentRecordState[];
  visitPacks?: AgentVisitPackState[];
  followUpAt?: Date | string | null;
};

export type AgentTodoSuggestion = {
  type: string;
  title: string;
  dueAt?: Date | null;
  sourceType: AgentTodoSourceType;
  sourceId: string;
  metadata: AgentTodoMetadata;
};

export type AgentRuleInput = {
  state: AgentMemberState;
};

export type AgentRule = (input: AgentRuleInput) => AgentTodoSuggestion[];

export type AgentTodoSuggestionInput = Omit<AgentTodoSuggestion, "metadata"> & {
  rule: AgentTodoRule;
  suggestedAction: AgentSuggestedAction;
  missingFields?: string[];
};

export function createAgentTodoSuggestion(input: AgentTodoSuggestionInput): AgentTodoSuggestion {
  return {
    type: input.type,
    title: input.title,
    dueAt: input.dueAt ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: createAgentTodoMetadata({
      rule: input.rule,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      suggestedAction: input.suggestedAction,
      ...(input.missingFields ? { missingFields: input.missingFields } : {}),
    }),
  };
}

@Injectable()
export class AgentRuleService {
  constructor(private readonly rules: AgentRule[] = []) {}

  suggestTodos(state: AgentMemberState): AgentTodoSuggestion[] {
    return this.rules.flatMap((rule) => rule({ state }));
  }
}
