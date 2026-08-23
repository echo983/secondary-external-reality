import type {
  CandidateEnvelope,
  CandidateSelection,
  CommitmentCostVector,
  ConditionalCandidate,
  EnvelopeEvaluation,
  JuryReport,
} from "./types.js";

export function commitmentCost(candidate: ConditionalCandidate): CommitmentCostVector {
  return {
    newWorldCommitments: candidate.newWorldCommitments.length,
    stateChanges: candidate.proposedStateChanges.length,
    events: candidate.proposedEvents.length,
    observations: candidate.observations.length,
    resolvedProjections: new Set(
      candidate.requiresResolution.map((requirement) => requirement.projection),
    ).size,
  };
}

export function costDominates(
  left: CommitmentCostVector,
  right: CommitmentCostVector,
): boolean {
  const keys = Object.keys(left) as Array<keyof CommitmentCostVector>;
  return (
    keys.every((key) => left[key] <= right[key]) &&
    keys.some((key) => left[key] < right[key])
  );
}

export function selectCandidate(
  envelope: CandidateEnvelope,
  evaluation: EnvelopeEvaluation,
  juryReports: readonly JuryReport[],
): CandidateSelection {
  if (!evaluation.valid) {
    return {
      status: "none",
      selectedCandidateId: null,
      nonDominatedCandidateIds: [],
      entries: [],
    };
  }

  const eligibleIds = new Set(evaluation.eligibleCandidateIds);
  const passedIds = new Set(
    juryReports
      .filter((report) => report.verdict === "pass" && report.violations.length === 0)
      .map((report) => report.candidateId),
  );
  const candidates = envelope.candidates.filter(
    (candidate) => eligibleIds.has(candidate.candidateId) && passedIds.has(candidate.candidateId),
  );

  const costs = new Map(
    candidates.map((candidate) => [candidate.candidateId, commitmentCost(candidate)]),
  );
  const entries = candidates.map((candidate) => {
    const candidateCost = costs.get(candidate.candidateId)!;
    return {
      candidateId: candidate.candidateId,
      cost: candidateCost,
      dominatedBy: candidates
        .filter(
          (other) =>
            other.candidateId !== candidate.candidateId &&
            costDominates(costs.get(other.candidateId)!, candidateCost),
        )
        .map((other) => other.candidateId)
        .sort(),
    };
  });
  const nonDominatedCandidateIds = entries
    .filter((entry) => entry.dominatedBy.length === 0)
    .map((entry) => entry.candidateId)
    .sort();

  if (nonDominatedCandidateIds.length === 1) {
    return {
      status: "selected",
      selectedCandidateId: nonDominatedCandidateIds[0]!,
      nonDominatedCandidateIds,
      entries,
    };
  }

  return {
    status: nonDominatedCandidateIds.length > 1 ? "ambiguous" : "none",
    selectedCandidateId: null,
    nonDominatedCandidateIds,
    entries,
  };
}
