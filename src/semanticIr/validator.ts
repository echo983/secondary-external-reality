import { SEMANTIC_IR_VERSION, type SemanticEnvelopeV09, type SemanticValidationIssue, type SemanticValidationResult } from "./types.js";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[], path: string, issues: SemanticValidationIssue[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push({ code: "UNKNOWN_FIELD", path: `${path}.${key}`, message: `${key} is not allowed.` });
}
function span(value: unknown, raw: string, path: string, issues: SemanticValidationIssue[]): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || !raw.includes(value)) issues.push({ code: "INVALID_SOURCE_SPAN", path, message: "Value must be an exact non-empty input span." });
}

export function validateSemanticProposal(input: unknown, rawTtd: string): SemanticValidationResult {
  const issues: SemanticValidationIssue[] = [];
  if (!record(input)) return { valid: false, proposal: null, issues: [{ code: "INVALID_ENVELOPE", path: "$", message: "Expected object." }] };
  exact(input, ["schemaVersion", "inputLanguage", "intents"], "$", issues);
  if (input.schemaVersion !== SEMANTIC_IR_VERSION) issues.push({ code: "INVALID_VERSION", path: "$.schemaVersion", message: `Expected ${SEMANTIC_IR_VERSION}.` });
  if (input.inputLanguage !== "zh" && input.inputLanguage !== "en") issues.push({ code: "INVALID_LANGUAGE", path: "$.inputLanguage", message: "Expected zh or en." });
  if (!Array.isArray(input.intents) || input.intents.length < 1 || input.intents.length > 4) issues.push({ code: "INVALID_INTENTS", path: "$.intents", message: "Expected one to four intents." });
  else input.intents.forEach((intent, index) => {
    const path = `$.intents[${index}]`;
    if (!record(intent)) { issues.push({ code: "INVALID_INTENT", path, message: "Expected object." }); return; }
    exact(intent, ["intentId", "kind", "verbPhrase", "actor", "references", "query", "modifiers"], path, issues);
    if (typeof intent.intentId !== "string" || !/^s[1-4]$/u.test(intent.intentId)) issues.push({ code: "INVALID_INTENT_ID", path: `${path}.intentId`, message: "Use s1-s4." });
    if (!["act", "perceive", "query", "communicate", "wait", "unsupported"].includes(String(intent.kind))) issues.push({ code: "INVALID_KIND", path: `${path}.kind`, message: "Unknown semantic kind." });
    span(intent.verbPhrase, rawTtd, `${path}.verbPhrase`, issues);
    if (intent.actor !== "self") issues.push({ code: "INVALID_ACTOR", path: `${path}.actor`, message: "Actor must be self." });
    if (!Array.isArray(intent.references) || intent.references.length > 4) issues.push({ code: "INVALID_REFERENCES", path: `${path}.references`, message: "Expected up to four references." });
    else intent.references.forEach((ref, ri) => { if (!record(ref)) return issues.push({ code: "INVALID_REFERENCE", path: `${path}.references[${ri}]`, message: "Expected object." }); exact(ref, ["role", "mention"], `${path}.references[${ri}]`, issues); if (!["target", "destination", "instrument", "topic"].includes(String(ref.role))) issues.push({ code: "INVALID_ROLE", path: `${path}.references[${ri}].role`, message: "Unknown role." }); span(ref.mention, rawTtd, `${path}.references[${ri}].mention`, issues); });
    if (intent.query !== undefined) { if (!record(intent.query)) issues.push({ code: "INVALID_QUERY", path: `${path}.query`, message: "Expected object." }); else { exact(intent.query, ["mode", "aspectMention"], `${path}.query`, issues); if (!["presence", "value", "location", "contents", "inventory"].includes(String(intent.query.mode))) issues.push({ code: "INVALID_QUERY_MODE", path: `${path}.query.mode`, message: "Unknown query mode." }); if (intent.query.aspectMention !== undefined) span(intent.query.aspectMention, rawTtd, `${path}.query.aspectMention`, issues); } }
    if (!record(intent.modifiers)) issues.push({ code: "INVALID_MODIFIERS", path: `${path}.modifiers`, message: "Expected object." }); else { exact(intent.modifiers, ["negated", "hypothetical", "conditional"], `${path}.modifiers`, issues); for (const key of ["negated", "hypothetical", "conditional"]) if (typeof intent.modifiers[key] !== "boolean") issues.push({ code: "INVALID_MODIFIER", path: `${path}.modifiers.${key}`, message: "Expected boolean." }); }
  });
  return issues.length ? { valid: false, proposal: null, issues } : { valid: true, proposal: structuredClone(input) as unknown as SemanticEnvelopeV09, issues: [] };
}

export function parseSemanticProposalJson(text: string, rawTtd: string): SemanticValidationResult {
  try { return validateSemanticProposal(JSON.parse(text), rawTtd); } catch { return { valid: false, proposal: null, issues: [{ code: "MALFORMED_JSON", path: "$", message: "Expected JSON only." }] }; }
}
