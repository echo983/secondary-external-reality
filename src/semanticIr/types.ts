export const SEMANTIC_IR_VERSION = "0.9.0" as const;
export type SemanticKind = "act" | "perceive" | "query" | "communicate" | "wait" | "unsupported";
export type SemanticReferenceRole = "target" | "destination" | "instrument" | "topic";
export type SemanticQueryMode = "presence" | "value" | "location" | "contents" | "inventory";

export interface SemanticIntentV09 {
  intentId: string;
  kind: SemanticKind;
  verbPhrase: string;
  actor: "self";
  references: Array<{ role: SemanticReferenceRole; mention: string }>;
  query?: { mode: SemanticQueryMode; aspectMention?: string };
  modifiers: { negated: boolean; hypothetical: boolean; conditional: boolean };
}

export interface SemanticEnvelopeV09 { schemaVersion: typeof SEMANTIC_IR_VERSION; inputLanguage: "zh" | "en"; intents: SemanticIntentV09[] }
export interface SemanticValidationIssue { code: string; path: string; message: string }
export interface SemanticValidationResult { valid: boolean; proposal: SemanticEnvelopeV09 | null; issues: SemanticValidationIssue[] }
