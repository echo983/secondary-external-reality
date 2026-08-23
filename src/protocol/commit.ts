import type {
  CandidateEnvelope,
  CandidateSelection,
  CommitPreparationResult,
  ProjectionSnapshot,
  ValidationIssue,
} from "./types.js";

function addIssue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

export function prepareCommitPackage(
  turnId: string,
  commitSequence: number,
  envelope: CandidateEnvelope,
  selection: CandidateSelection,
  expectedSnapshots: readonly ProjectionSnapshot[],
  currentSnapshots: readonly ProjectionSnapshot[],
): CommitPreparationResult {
  const issues: ValidationIssue[] = [];

  if (selection.status !== "selected" || selection.selectedCandidateId === null) {
    addIssue(issues, "NO_UNIQUE_SELECTION", "selection", "A commit requires one uniquely selected candidate.");
  }
  if (turnId.length === 0) {
    addIssue(issues, "INVALID_TURN_ID", "turnId", "Turn ID must be non-empty.");
  }
  if (!Number.isSafeInteger(commitSequence) || commitSequence < 0) {
    addIssue(issues, "INVALID_COMMIT_SEQUENCE", "commitSequence", "Commit sequence must be a non-negative safe integer.");
  }

  const current = new Map(currentSnapshots.map((snapshot) => [snapshot.projection, snapshot]));
  const expectedProjectionRevisions: Record<string, number> = {};
  expectedSnapshots.forEach((snapshot, index) => {
    const path = `expectedSnapshots[${index}]`;
    expectedProjectionRevisions[snapshot.projection] = snapshot.revision;
    const latest = current.get(snapshot.projection);
    if (!latest) {
      addIssue(issues, "MISSING_CURRENT_SNAPSHOT", `${path}.projection`, "Projection disappeared before commit.");
      return;
    }
    if (latest.revision !== snapshot.revision) {
      addIssue(issues, "REVISION_CONFLICT", `${path}.revision`, `${snapshot.projection} changed before commit.`);
    }
    if (latest.value !== snapshot.value) {
      addIssue(issues, "VALUE_CONFLICT", `${path}.value`, `${snapshot.projection} changed value before commit.`);
    }
  });

  const selected = envelope.candidates.find(
    (candidate) => candidate.candidateId === selection.selectedCandidateId,
  );
  if (!selected) {
    addIssue(issues, "SELECTED_CANDIDATE_MISSING", "selection.selectedCandidateId", "Selected candidate is absent from the envelope.");
  }

  if (issues.length > 0 || !selected || selection.selectedCandidateId === null) {
    return { ready: false, issues, commitPackage: null };
  }

  return {
    ready: true,
    issues: [],
    commitPackage: {
      turnId,
      commitSequence,
      selectedCandidateId: selected.candidateId,
      expectedProjectionRevisions,
      events: structuredClone(selected.proposedEvents),
      stateChanges: structuredClone(selected.proposedStateChanges),
      observations: structuredClone(selected.observations),
      newWorldCommitments: structuredClone(selected.newWorldCommitments),
    },
  };
}
