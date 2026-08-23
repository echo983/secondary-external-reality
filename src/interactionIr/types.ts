export const INTERACTION_IR_VERSION = "1.0.0" as const;
export const INTERACTION_SPEECH_ACTS = ["action_request", "world_query", "capability_query", "conversation", "incomplete", "unsupported"] as const;
export type InteractionSpeechAct = (typeof INTERACTION_SPEECH_ACTS)[number];
export const INTERACTION_ACTUALITIES = ["actual", "non_executing", "negated", "hypothetical", "conditional"] as const;
export type InteractionActuality = (typeof INTERACTION_ACTUALITIES)[number];
export const INTERACTION_OPERATIONS = ["take", "place", "put_inside", "open", "close", "observe", "write", "read", "look_around", "inspect_contents", "locate", "inventory", "unknown"] as const;
export type InteractionOperation = (typeof INTERACTION_OPERATIONS)[number];
export const INTERACTION_ROLES = ["target", "destination", "instrument", "content"] as const;
export type InteractionRole = (typeof INTERACTION_ROLES)[number];
export const INTERACTION_QUERY_MODES = ["presence", "value", "location", "contents", "inventory", "capability"] as const;
export type InteractionQueryMode = (typeof INTERACTION_QUERY_MODES)[number];

export interface InteractionClauseV10 {
  clauseId: string;
  operation: InteractionOperation;
  verbSpan: string;
  roles: Array<{ role: InteractionRole; mention: string }>;
  queryMode?: InteractionQueryMode;
}

export interface InteractionEnvelopeV10 {
  schemaVersion: typeof INTERACTION_IR_VERSION;
  inputLanguage: "zh" | "en";
  speechAct: InteractionSpeechAct;
  actuality: InteractionActuality;
  clauses: InteractionClauseV10[];
}

export interface InteractionValidationIssue { code: string; path: string; message: string }
export interface InteractionValidationResult { valid: boolean; proposal: InteractionEnvelopeV10 | null; issues: InteractionValidationIssue[] }
