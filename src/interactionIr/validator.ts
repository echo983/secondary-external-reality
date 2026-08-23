import { INTERACTION_ACTUALITIES, INTERACTION_IR_VERSION, INTERACTION_OPERATIONS, INTERACTION_QUERY_MODES, INTERACTION_ROLES, INTERACTION_SPEECH_ACTS, type InteractionEnvelopeV10, type InteractionValidationIssue, type InteractionValidationResult } from "./types.js";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[], path: string, issues: InteractionValidationIssue[]): void {
  Object.keys(value).filter((key) => !keys.includes(key)).forEach((key) => issues.push({ code: "UNKNOWN_FIELD", path: `${path}.${key}`, message: `${key} is not allowed.` }));
}
function span(value: unknown, raw: string, path: string, issues: InteractionValidationIssue[]): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || !raw.includes(value)) issues.push({ code: "INVALID_SOURCE_SPAN", path, message: "Expected an exact non-empty input span." });
}

export function validateInteractionProposal(input: unknown, rawTtd: string): InteractionValidationResult {
  const issues: InteractionValidationIssue[] = [];
  if (!record(input)) return { valid: false, proposal: null, issues: [{ code: "INVALID_ENVELOPE", path: "$", message: "Expected object." }] };
  exact(input, ["schemaVersion", "inputLanguage", "speechAct", "actuality", "clauses"], "$", issues);
  if (input.schemaVersion !== INTERACTION_IR_VERSION) issues.push({ code: "INVALID_VERSION", path: "$.schemaVersion", message: `Expected ${INTERACTION_IR_VERSION}.` });
  if (input.inputLanguage !== "zh" && input.inputLanguage !== "en") issues.push({ code: "INVALID_LANGUAGE", path: "$.inputLanguage", message: "Expected zh or en." });
  if (!INTERACTION_SPEECH_ACTS.includes(input.speechAct as never)) issues.push({ code: "INVALID_SPEECH_ACT", path: "$.speechAct", message: "Unknown speech act." });
  if (!INTERACTION_ACTUALITIES.includes(input.actuality as never)) issues.push({ code: "INVALID_ACTUALITY", path: "$.actuality", message: "Unknown actuality." });
  if (!Array.isArray(input.clauses) || input.clauses.length > 4) issues.push({ code: "INVALID_CLAUSES", path: "$.clauses", message: "Expected zero to four clauses." });
  else input.clauses.forEach((clause, index) => {
    const path = `$.clauses[${index}]`;
    if (!record(clause)) return issues.push({ code: "INVALID_CLAUSE", path, message: "Expected object." });
    exact(clause, ["clauseId", "operation", "verbSpan", "roles", "queryMode"], path, issues);
    if (clause.clauseId !== `c${index + 1}`) issues.push({ code: "INVALID_CLAUSE_ID", path: `${path}.clauseId`, message: `Expected c${index + 1}.` });
    if (!INTERACTION_OPERATIONS.includes(clause.operation as never)) issues.push({ code: "INVALID_OPERATION", path: `${path}.operation`, message: "Unknown operation." });
    span(clause.verbSpan, rawTtd, `${path}.verbSpan`, issues);
    if (!Array.isArray(clause.roles) || clause.roles.length > 4) issues.push({ code: "INVALID_ROLES", path: `${path}.roles`, message: "Expected up to four roles." });
    else clause.roles.forEach((role, roleIndex) => {
      const rolePath = `${path}.roles[${roleIndex}]`;
      if (!record(role)) return issues.push({ code: "INVALID_ROLE", path: rolePath, message: "Expected object." });
      exact(role, ["role", "mention"], rolePath, issues);
      if (!INTERACTION_ROLES.includes(role.role as never)) issues.push({ code: "INVALID_ROLE", path: `${rolePath}.role`, message: "Unknown role." });
      span(role.mention, rawTtd, `${rolePath}.mention`, issues);
    });
    if (input.speechAct !== "action_request" && clause.queryMode !== undefined && clause.queryMode !== null && !INTERACTION_QUERY_MODES.includes(clause.queryMode as never)) issues.push({ code: "INVALID_QUERY_MODE", path: `${path}.queryMode`, message: "Unknown query mode." });
  });
  const speechAct = String(input.speechAct);
  const clauseCount = Array.isArray(input.clauses) ? input.clauses.length : 0;
  if (["action_request", "world_query", "capability_query"].includes(speechAct) && clauseCount === 0) issues.push({ code: "CLAUSE_REQUIRED", path: "$.clauses", message: "This speech act requires at least one clause." });
  if (speechAct === "action_request" && input.actuality === "non_executing") issues.push({ code: "ACTUALITY_CONTRADICTION", path: "$.actuality", message: "Action expressions must preserve actual, negated, hypothetical, or conditional actuality." });
  if (speechAct !== "action_request" && input.actuality !== "non_executing") issues.push({ code: "ACTUALITY_CONTRADICTION", path: "$.actuality", message: "Every non-action speech act must be non_executing." });
  if (speechAct === "action_request" && Array.isArray(input.clauses) && input.clauses.some((clause) => record(clause) && clause.queryMode === "capability")) {
    issues.push({ code: "CAPABILITY_MODE_ON_ACTION", path: "$.clauses", message: "Capability questions cannot be admitted as actions." });
  }
  if (issues.length) return { valid: false, proposal: null, issues };
  const proposal = structuredClone(input) as Record<string, unknown>;
  if (Array.isArray(proposal.clauses)) proposal.clauses.forEach((clause) => {
    if (record(clause) && (clause.queryMode === null || speechAct === "action_request")) delete clause.queryMode;
  });
  return { valid: true, proposal: proposal as unknown as InteractionEnvelopeV10, issues: [] };
}

export function parseInteractionProposalJson(text: string, rawTtd: string): InteractionValidationResult {
  try { return validateInteractionProposal(JSON.parse(text), rawTtd); }
  catch { return { valid: false, proposal: null, issues: [{ code: "MALFORMED_JSON", path: "$", message: "Expected JSON only." }] }; }
}
