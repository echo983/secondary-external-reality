import {
  ACTION_EFFORTS,
  ACTION_IR_SCHEMA_VERSION,
  ACTION_MANNERS,
  ACTION_PROPOSAL_EXITS,
  ACTION_PRIMITIVES,
  ACTION_ROLES,
  type ActionIrValidationIssue,
  type ActionIrValidationResult,
  type ActionPrimitive,
  type ActionProposalEnvelopeV07,
} from "./types.js";
import { primitiveContract } from "./primitiveContracts.js";

const primitives = new Set<string>(ACTION_PRIMITIVES);
const roles = new Set<string>(ACTION_ROLES);
const efforts = new Set<string>(ACTION_EFFORTS);
const manners = new Set<string>(ACTION_MANNERS);
const exits = new Set<string>(ACTION_PROPOSAL_EXITS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(issues: ActionIrValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ActionIrValidationIssue[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) add(issues, "UNKNOWN_FIELD", `${path}.${key}`, `Field ${key} is not allowed.`);
  }
}

export function validateActionProposal(input: unknown, rawTtd: string): ActionIrValidationResult {
  const issues: ActionIrValidationIssue[] = [];
  if (!isRecord(input)) return { valid: false, issues: [{ code: "INVALID_ENVELOPE", path: "$", message: "Proposal must be an object." }], proposal: null };
  exactKeys(input, ["schemaVersion", "inputLanguage", "exitKind", "steps"], "$", issues);
  if (input.schemaVersion !== ACTION_IR_SCHEMA_VERSION) add(issues, "UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion", `Expected ${ACTION_IR_SCHEMA_VERSION}.`);
  if (input.inputLanguage !== "zh" && input.inputLanguage !== "en") add(issues, "INVALID_INPUT_LANGUAGE", "$.inputLanguage", "Language must be zh or en.");
  if (typeof input.exitKind !== "string" || !exits.has(input.exitKind)) add(issues, "INVALID_EXIT_KIND", "$.exitKind", "Exit kind is outside the closed registry.");
  if (!Array.isArray(input.steps)) add(issues, "INVALID_STEPS", "$.steps", "Steps must be an array.");
  else {
    if (input.exitKind === "actions" && input.steps.length === 0) add(issues, "EMPTY_STEPS", "$.steps", "An actions exit requires at least one step.");
    if ((input.exitKind === "unsupported_action" || input.exitKind === "not_an_action") && input.steps.length !== 0) add(issues, "STEPS_FOR_NON_ACTION_EXIT", "$.steps", "Non-action exits cannot contain steps.");
    if (input.steps.length > 4) add(issues, "TOO_MANY_STEPS", "$.steps", "At most four steps are allowed.");
    const stepIds = new Set<string>();
    input.steps.forEach((rawStep, stepIndex) => {
      const path = `$.steps[${stepIndex}]`;
      if (!isRecord(rawStep)) {
        add(issues, "INVALID_STEP", path, "Step must be an object.");
        return;
      }
      exactKeys(rawStep, ["stepId", "primitive", "actor", "roles", "modifiers"], path, issues);
      if (typeof rawStep.stepId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(rawStep.stepId)) add(issues, "INVALID_STEP_ID", `${path}.stepId`, "Step ID must use 1–64 safe identifier characters.");
      else if (stepIds.has(rawStep.stepId)) add(issues, "DUPLICATE_STEP_ID", `${path}.stepId`, "Step IDs must be unique.");
      else stepIds.add(rawStep.stepId);
      if (typeof rawStep.primitive !== "string" || !primitives.has(rawStep.primitive)) add(issues, "UNKNOWN_PRIMITIVE", `${path}.primitive`, "Primitive is outside the closed registry.");
      if (rawStep.actor !== "self") add(issues, "INVALID_ACTOR", `${path}.actor`, "The MVP actor must be self.");

      const roleCounts = new Map<string, number>();
      if (!Array.isArray(rawStep.roles)) add(issues, "INVALID_ROLES", `${path}.roles`, "Roles must be an array.");
      else {
        if (rawStep.roles.length > 4) add(issues, "TOO_MANY_ROLES", `${path}.roles`, "At most four roles are allowed.");
        rawStep.roles.forEach((rawRole, roleIndex) => {
          const rolePath = `${path}.roles[${roleIndex}]`;
          if (!isRecord(rawRole)) {
            add(issues, "INVALID_ROLE", rolePath, "Role must be an object.");
            return;
          }
          exactKeys(rawRole, ["role", "mention"], rolePath, issues);
          if (typeof rawRole.role !== "string" || !roles.has(rawRole.role)) add(issues, "UNKNOWN_ROLE", `${rolePath}.role`, "Role is outside the closed registry.");
          else roleCounts.set(rawRole.role, (roleCounts.get(rawRole.role) ?? 0) + 1);
          if (typeof rawRole.mention !== "string" || rawRole.mention.length === 0 || rawRole.mention.length > 256 || rawRole.mention.trim() !== rawRole.mention) add(issues, "INVALID_MENTION", `${rolePath}.mention`, "Mention must contain 1–256 non-padded characters.");
          else if (!rawTtd.includes(rawRole.mention)) add(issues, "MENTION_NOT_IN_INPUT", `${rolePath}.mention`, "Mention must be an exact contiguous input span.");
        });
      }

      if (!isRecord(rawStep.modifiers)) add(issues, "INVALID_MODIFIERS", `${path}.modifiers`, "Modifiers must be an object.");
      else {
        exactKeys(rawStep.modifiers, ["effort", "manner"], `${path}.modifiers`, issues);
        if ("effort" in rawStep.modifiers && (typeof rawStep.modifiers.effort !== "string" || !efforts.has(rawStep.modifiers.effort))) add(issues, "INVALID_EFFORT", `${path}.modifiers.effort`, "Effort is outside the closed registry.");
        if ("manner" in rawStep.modifiers && (typeof rawStep.modifiers.manner !== "string" || !manners.has(rawStep.modifiers.manner))) add(issues, "INVALID_MANNER", `${path}.modifiers.manner`, "Manner is outside the closed registry.");
      }

      if (typeof rawStep.primitive === "string" && primitives.has(rawStep.primitive)) {
        const contract = primitiveContract(rawStep.primitive as ActionPrimitive);
        const declared = new Set<string>(contract.roles.map((role) => role.role));
        for (const [role, count] of roleCounts) {
          if (!declared.has(role)) add(issues, "ROLE_NOT_ALLOWED", `${path}.roles`, `${role} is not allowed for ${rawStep.primitive}.`);
          if (count > 1) add(issues, "DUPLICATE_ROLE", `${path}.roles`, `${role} may appear only once.`);
        }
        for (const role of contract.roles) {
          if (role.required && (roleCounts.get(role.role) ?? 0) !== 1) add(issues, "MISSING_REQUIRED_ROLE", `${path}.roles`, `${role.role} is required for ${rawStep.primitive}.`);
          if (role.literalKind === "digits_1_64") {
            const literal = Array.isArray(rawStep.roles)
              ? rawStep.roles.find((candidate) => isRecord(candidate) && candidate.role === role.role)
              : undefined;
            if (isRecord(literal) && typeof literal.mention === "string" && !/^[0-9]{1,64}$/u.test(literal.mention)) {
              add(issues, "INVALID_LITERAL", `${path}.roles`, `${role.role} must contain 1–64 digits.`);
            }
          }
        }
      }
    });
  }
  if (issues.length > 0) return { valid: false, issues, proposal: null };
  return { valid: true, issues: [], proposal: structuredClone(input) as unknown as ActionProposalEnvelopeV07 };
}

export function parseActionProposalJson(text: string, rawTtd: string): ActionIrValidationResult {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { valid: false, issues: [{ code: "MALFORMED_JSON", path: "$", message: "Model output must be one JSON object." }], proposal: null };
  }
  return validateActionProposal(input, rawTtd);
}
