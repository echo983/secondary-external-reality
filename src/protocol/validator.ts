import {
  EVENT_TYPES,
  OUTCOME_KINDS,
  type CandidateCondition,
  type CandidateEnvelope,
  type ConditionalCandidate,
  type ProjectionDefinition,
  type ProposedEvent,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

const outcomeKinds = new Set<string>(OUTCOME_KINDS);
const eventTypes = new Set<string>(EVENT_TYPES);

function issue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateConditionShape(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is CandidateCondition {
  if (!isRecord(value)) {
    issue(issues, "INVALID_CONDITION", path, "Condition must be an object.");
    return false;
  }

  let valid = true;
  if (typeof value.projection !== "string" || value.projection.length === 0) {
    issue(issues, "INVALID_PROJECTION", `${path}.projection`, "Projection must be a non-empty string.");
    valid = false;
  }
  if (value.operator !== "eq") {
    issue(issues, "INVALID_OPERATOR", `${path}.operator`, "Only the eq operator is supported.");
    valid = false;
  }
  if (typeof value.value !== "string") {
    issue(issues, "INVALID_CONDITION_VALUE", `${path}.value`, "Condition value must be a string.");
    valid = false;
  }
  return valid;
}

function validateEventShape(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is ProposedEvent {
  if (!isRecord(value)) {
    issue(issues, "INVALID_EVENT", path, "Event must be an object.");
    return false;
  }

  let valid = true;
  if (typeof value.eventId !== "string" || value.eventId.length === 0) {
    issue(issues, "INVALID_EVENT_ID", `${path}.eventId`, "Event ID must be a non-empty string.");
    valid = false;
  }
  if (typeof value.type !== "string" || !eventTypes.has(value.type)) {
    issue(issues, "UNKNOWN_EVENT_TYPE", `${path}.type`, "Event type is not in the closed registry.");
    valid = false;
  }
  if ("facts" in value) {
    issue(issues, "FREE_TEXT_EVENT_FACTS", `${path}.facts`, "Free-text event facts are forbidden.");
    valid = false;
  }
  return valid;
}

function validateCandidate(
  candidate: ConditionalCandidate,
  index: number,
  registry: Map<string, ProjectionDefinition>,
  issues: ValidationIssue[],
): void {
  const path = `candidates[${index}]`;
  const required = new Set<string>();

  if (!outcomeKinds.has(candidate.outcomeKind)) {
    issue(issues, "INVALID_OUTCOME_KIND", `${path}.outcomeKind`, "Unknown outcome kind.");
  }

  candidate.requiresResolution.forEach((requirement, requirementIndex) => {
    const requirementPath = `${path}.requiresResolution[${requirementIndex}]`;
    const definition = registry.get(requirement.projection);
    if (!definition) {
      issue(issues, "UNKNOWN_PROJECTION", `${requirementPath}.projection`, "Projection is absent from the registry.");
      return;
    }
    if (definition.state !== "unknown") {
      issue(issues, "RESOLUTION_NOT_REQUIRED", `${requirementPath}.projection`, "Only unknown projections may be resolved.");
    }
    if (required.has(requirement.projection)) {
      issue(issues, "DUPLICATE_RESOLUTION", `${requirementPath}.projection`, "Projection is requested more than once.");
    }
    required.add(requirement.projection);
  });

  const usedRequired = new Set<string>();
  candidate.conditions.forEach((condition, conditionIndex) => {
    const conditionPath = `${path}.conditions[${conditionIndex}]`;
    const definition = registry.get(condition.projection);
    if (!definition) {
      issue(issues, "UNKNOWN_PROJECTION", `${conditionPath}.projection`, "Projection is absent from the registry.");
      return;
    }
    if (!definition.allowedValues.includes(condition.value)) {
      issue(issues, "VALUE_OUTSIDE_DOMAIN", `${conditionPath}.value`, "Value is outside the projection domain.");
    }
    if (definition.state === "unknown") {
      if (!required.has(condition.projection)) {
        issue(issues, "UNDECLARED_CONDITION", `${conditionPath}.projection`, "Unknown condition was not declared for resolution.");
      } else {
        usedRequired.add(condition.projection);
      }
    }
    if (definition.state === "unsupported") {
      issue(issues, "UNSUPPORTED_PROJECTION", `${conditionPath}.projection`, "Unsupported projections cannot participate in candidates.");
    }
  });

  for (const projection of required) {
    if (!usedRequired.has(projection)) {
      issue(issues, "UNUSED_RESOLUTION", `${path}.requiresResolution`, `${projection} is requested but never used by a condition.`);
    }
  }

  const eventIds = new Set<string>();
  const socialResponses = new Set<string>();
  candidate.proposedEvents.forEach((event, eventIndex) => {
    const eventPath = `${path}.proposedEvents[${eventIndex}]`;
    if (eventIds.has(event.eventId)) {
      issue(issues, "DUPLICATE_EVENT_ID", `${eventPath}.eventId`, "Event ID must be unique within a candidate.");
    }
    eventIds.add(event.eventId);
    if (event.type === "social_response" && event.responseKind) {
      socialResponses.add(event.responseKind);
    }
  });

  if (socialResponses.size > 1) {
    issue(issues, "MUTUALLY_EXCLUSIVE_EVENTS", `${path}.proposedEvents`, "A candidate cannot contain multiple social responses.");
  }

  candidate.proposedStateChanges.forEach((change, changeIndex) => {
    const changePath = `${path}.proposedStateChanges[${changeIndex}]`;
    if (!registry.has(change.projection)) {
      issue(issues, "UNKNOWN_PROJECTION", `${changePath}.projection`, "State change projection is absent from the registry.");
    }
    if (!eventIds.has(change.causedByEventId)) {
      issue(issues, "MISSING_CAUSE_EVENT", `${changePath}.causedByEventId`, "State change must reference a proposed event.");
    }
  });

  if (candidate.outcomeKind === "success") {
    const hasSuccessfulResult = candidate.proposedEvents.some(
      (event) => event.type === "action_result" && event.outcome === "success",
    );
    if (!hasSuccessfulResult || candidate.proposedStateChanges.length === 0) {
      issue(issues, "UNCONSTITUTED_SUCCESS", path, "Success requires a successful action result and a resulting state change.");
    }
  }
}

export function validateCandidateEnvelope(
  input: unknown,
  projectionRegistry: readonly ProjectionDefinition[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input) || !Array.isArray(input.candidates)) {
    return {
      valid: false,
      issues: [{ code: "INVALID_ENVELOPE", path: "candidates", message: "Envelope must contain a candidates array." }],
    };
  }

  const registry = new Map(projectionRegistry.map((definition) => [definition.address, definition]));
  const candidateIds = new Set<string>();

  input.candidates.forEach((rawCandidate, index) => {
    const path = `candidates[${index}]`;
    if (!isRecord(rawCandidate)) {
      issue(issues, "INVALID_CANDIDATE", path, "Candidate must be an object.");
      return;
    }
    if (typeof rawCandidate.candidateId !== "string" || rawCandidate.candidateId.length === 0) {
      issue(issues, "INVALID_CANDIDATE_ID", `${path}.candidateId`, "Candidate ID must be a non-empty string.");
    } else if (candidateIds.has(rawCandidate.candidateId)) {
      issue(issues, "DUPLICATE_CANDIDATE_ID", `${path}.candidateId`, "Candidate ID must be unique.");
    } else {
      candidateIds.add(rawCandidate.candidateId);
    }

    const arrays = [
      "requiresResolution",
      "conditions",
      "proposedEvents",
      "proposedStateChanges",
      "observations",
      "newWorldCommitments",
    ] as const;
    for (const field of arrays) {
      if (!Array.isArray(rawCandidate[field])) {
        issue(issues, "MISSING_ARRAY_FIELD", `${path}.${field}`, `${field} must be an array.`);
      }
    }
    if (issues.some((entry) => entry.path.startsWith(path) && entry.code === "MISSING_ARRAY_FIELD")) {
      return;
    }

    const rawConditions = rawCandidate.conditions as unknown[];
    const rawEvents = rawCandidate.proposedEvents as unknown[];

    rawConditions.forEach((condition: unknown, conditionIndex: number) =>
      validateConditionShape(condition, `${path}.conditions[${conditionIndex}]`, issues),
    );
    rawEvents.forEach((event: unknown, eventIndex: number) =>
      validateEventShape(event, `${path}.proposedEvents[${eventIndex}]`, issues),
    );

    validateCandidate(rawCandidate as unknown as ConditionalCandidate, index, registry, issues);
  });

  return { valid: issues.length === 0, issues };
}

export function shouldInvokeJury(
  validation: ValidationResult,
  eligibleCandidateCount: number,
): boolean {
  return validation.valid && eligibleCandidateCount > 0;
}
