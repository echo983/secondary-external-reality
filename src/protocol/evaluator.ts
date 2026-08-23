import type {
  CandidateEnvelope,
  CandidateEvaluation,
  ConditionalCandidate,
  EnvelopeEvaluation,
  JuryBatch,
  ProjectionDefinition,
  ProjectionSnapshot,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

function addIssue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

export function evaluateCandidateEnvelope(
  envelope: CandidateEnvelope,
  projectionRegistry: readonly ProjectionDefinition[],
  snapshots: readonly ProjectionSnapshot[],
): EnvelopeEvaluation {
  const issues: ValidationIssue[] = [];
  const registry = new Map(projectionRegistry.map((definition) => [definition.address, definition]));
  const values = new Map<string, ProjectionSnapshot>();

  snapshots.forEach((snapshot, index) => {
    const path = `snapshots[${index}]`;
    const definition = registry.get(snapshot.projection);
    if (!definition) {
      addIssue(issues, "UNKNOWN_SNAPSHOT_PROJECTION", `${path}.projection`, "Snapshot projection is absent from the registry.");
      return;
    }
    if (!definition.allowedValues.includes(snapshot.value)) {
      addIssue(issues, "SNAPSHOT_VALUE_OUTSIDE_DOMAIN", `${path}.value`, "Snapshot value is outside the projection domain.");
    }
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
      addIssue(issues, "INVALID_SNAPSHOT_REVISION", `${path}.revision`, "Snapshot revision must be a non-negative safe integer.");
    }
    if (values.has(snapshot.projection)) {
      addIssue(issues, "DUPLICATE_SNAPSHOT", `${path}.projection`, "A projection may have only one snapshot per evaluation.");
    }
    values.set(snapshot.projection, snapshot);
  });

  const candidates: CandidateEvaluation[] = envelope.candidates.map((candidate) => {
    const unresolved = new Set<string>();
    for (const requirement of candidate.requiresResolution) {
      if (!values.has(requirement.projection)) {
        unresolved.add(requirement.projection);
      }
    }

    const conditions = candidate.conditions.map((condition) => {
      const snapshot = values.get(condition.projection);
      if (!snapshot) {
        unresolved.add(condition.projection);
        return {
          projection: condition.projection,
          expectedValue: condition.value,
          matched: null,
        };
      }
      return {
        projection: condition.projection,
        expectedValue: condition.value,
        actualValue: snapshot.value,
        matched: snapshot.value === condition.value,
      };
    });

    let status: CandidateEvaluation["status"];
    if (unresolved.size > 0) {
      status = "unresolved";
    } else if (conditions.every((condition) => condition.matched === true)) {
      status = "eligible";
    } else {
      status = "ineligible";
    }

    return {
      candidateId: candidate.candidateId,
      status,
      conditions,
      unresolvedProjections: [...unresolved].sort(),
    };
  });

  return {
    valid: issues.length === 0,
    issues,
    candidates,
    eligibleCandidateIds: candidates
      .filter((candidate) => candidate.status === "eligible")
      .map((candidate) => candidate.candidateId),
  };
}

export function createJuryBatch(
  envelope: CandidateEnvelope,
  validation: ValidationResult,
  evaluation: EnvelopeEvaluation,
  snapshots: readonly ProjectionSnapshot[],
): JuryBatch | null {
  if (!validation.valid || !evaluation.valid || evaluation.eligibleCandidateIds.length === 0) {
    return null;
  }

  const eligibleIds = new Set(evaluation.eligibleCandidateIds);
  const candidates = envelope.candidates.filter((candidate: ConditionalCandidate) =>
    eligibleIds.has(candidate.candidateId),
  );
  if (candidates.length === 0) {
    return null;
  }

  return {
    projectionRevisions: Object.fromEntries(
      snapshots.map((snapshot) => [snapshot.projection, snapshot.revision]),
    ),
    candidates,
  };
}
