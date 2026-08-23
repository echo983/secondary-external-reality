import assert from "node:assert/strict";
import test from "node:test";

import { prepareCommitPackage } from "../src/protocol/commit.js";
import { costDominates, selectCandidate } from "../src/protocol/selector.js";
import type {
  CandidateEnvelope,
  ConditionalCandidate,
  EnvelopeEvaluation,
  JuryReport,
  ProjectionSnapshot,
} from "../src/protocol/types.js";

function makeCandidate(
  candidateId: string,
  counts: { events: number; changes: number; observations: number; commitments: number },
): ConditionalCandidate {
  return {
    candidateId,
    outcomeKind: "partial",
    requiresResolution: [],
    conditions: [],
    proposedEvents: Array.from({ length: counts.events }, (_, index) => ({
      eventId: `${candidateId}-event-${index}`,
      type: "action_result" as const,
      actionKind: "move",
      outcome: "partial" as const,
    })),
    proposedStateChanges: Array.from({ length: counts.changes }, (_, index) => ({
      projection: `entity:self.state.${index}`,
      to: "changed",
      causedByEventId: `${candidateId}-event-0`,
    })),
    observations: Array.from({ length: counts.observations }, () => ({})),
    newWorldCommitments: Array.from({ length: counts.commitments }, () => ({})),
  };
}

function evaluation(ids: string[]): EnvelopeEvaluation {
  return {
    valid: true,
    issues: [],
    candidates: ids.map((candidateId) => ({
      candidateId,
      status: "eligible",
      conditions: [],
      unresolvedProjections: [],
    })),
    eligibleCandidateIds: ids,
  };
}

function passes(ids: string[]): JuryReport[] {
  return ids.map((candidateId) => ({ candidateId, verdict: "pass", violations: [] }));
}

test("compares commitment vectors by Pareto dominance", () => {
  assert.equal(
    costDominates(
      { newWorldCommitments: 0, stateChanges: 1, events: 1, observations: 1, resolvedProjections: 1 },
      { newWorldCommitments: 1, stateChanges: 1, events: 2, observations: 1, resolvedProjections: 1 },
    ),
    true,
  );
  assert.equal(
    costDominates(
      { newWorldCommitments: 0, stateChanges: 2, events: 1, observations: 1, resolvedProjections: 1 },
      { newWorldCommitments: 1, stateChanges: 1, events: 2, observations: 1, resolvedProjections: 1 },
    ),
    false,
  );
});

test("selects the unique non-dominated eligible candidate that passed jury", () => {
  const minimal = makeCandidate("minimal", { events: 1, changes: 0, observations: 0, commitments: 0 });
  const expensive = makeCandidate("expensive", { events: 2, changes: 1, observations: 1, commitments: 1 });
  const envelope: CandidateEnvelope = { candidates: [minimal, expensive] };
  const result = selectCandidate(envelope, evaluation(["minimal", "expensive"]), passes(["minimal", "expensive"]));

  assert.equal(result.status, "selected");
  assert.equal(result.selectedCandidateId, "minimal");
  assert.deepEqual(result.entries.find((entry) => entry.candidateId === "expensive")?.dominatedBy, ["minimal"]);
});

test("returns ambiguous for incomparable non-dominated candidates", () => {
  const fewerEvents = makeCandidate("fewer-events", { events: 1, changes: 1, observations: 1, commitments: 1 });
  const fewerChanges = makeCandidate("fewer-changes", { events: 2, changes: 0, observations: 1, commitments: 1 });
  const envelope: CandidateEnvelope = { candidates: [fewerEvents, fewerChanges] };
  const result = selectCandidate(envelope, evaluation(["fewer-events", "fewer-changes"]), passes(["fewer-events", "fewer-changes"]));

  assert.equal(result.status, "ambiguous");
  assert.equal(result.selectedCandidateId, null);
  assert.deepEqual(result.nonDominatedCandidateIds, ["fewer-changes", "fewer-events"]);
});

test("excludes candidates that failed jury or were not eligible", () => {
  const first = makeCandidate("first", { events: 1, changes: 0, observations: 0, commitments: 0 });
  const second = makeCandidate("second", { events: 1, changes: 0, observations: 0, commitments: 0 });
  const envelope: CandidateEnvelope = { candidates: [first, second] };
  const reports: JuryReport[] = [
    { candidateId: "first", verdict: "fail", violations: [{ code: "X", path: "", message: "bad" }] },
    { candidateId: "second", verdict: "pass", violations: [] },
  ];
  const result = selectCandidate(envelope, evaluation(["first", "second"]), reports);
  assert.equal(result.selectedCandidateId, "second");
});

test("prepares an immutable commit package when revisions still match", () => {
  const selected = makeCandidate("selected", { events: 1, changes: 1, observations: 1, commitments: 1 });
  const envelope: CandidateEnvelope = { candidates: [selected] };
  const selection = selectCandidate(envelope, evaluation(["selected"]), passes(["selected"]));
  const snapshots: ProjectionSnapshot[] = [
    { projection: "entity:self.position", value: "bedside", revision: 8 },
  ];
  const result = prepareCommitPackage("turn-1", 9, envelope, selection, snapshots, snapshots);

  assert.equal(result.ready, true);
  assert.equal(result.commitPackage?.selectedCandidateId, "selected");
  assert.deepEqual(result.commitPackage?.expectedProjectionRevisions, {
    "entity:self.position": 8,
  });

  selected.proposedEvents.length = 0;
  assert.equal(result.commitPackage?.events.length, 1);
});

test("refuses commit preparation when a projection revision or value changed", () => {
  const selected = makeCandidate("selected", { events: 1, changes: 1, observations: 0, commitments: 0 });
  const envelope: CandidateEnvelope = { candidates: [selected] };
  const selection = selectCandidate(envelope, evaluation(["selected"]), passes(["selected"]));
  const expected: ProjectionSnapshot[] = [
    { projection: "entity:self.position", value: "bedside", revision: 8 },
  ];
  const current: ProjectionSnapshot[] = [
    { projection: "entity:self.position", value: "doorway", revision: 9 },
  ];
  const result = prepareCommitPackage("turn-1", 9, envelope, selection, expected, current);

  assert.equal(result.ready, false);
  assert.equal(result.commitPackage, null);
  assert.deepEqual(
    result.issues.map((entry) => entry.code).sort(),
    ["REVISION_CONFLICT", "VALUE_CONFLICT"],
  );
});

test("refuses commit preparation for ambiguous or absent selections", () => {
  const first = makeCandidate("first", { events: 1, changes: 0, observations: 0, commitments: 0 });
  const second = makeCandidate("second", { events: 1, changes: 0, observations: 0, commitments: 0 });
  const envelope: CandidateEnvelope = { candidates: [first, second] };
  const ambiguous = selectCandidate(envelope, evaluation(["first", "second"]), passes(["first", "second"]));
  const result = prepareCommitPackage("turn-1", 1, envelope, ambiguous, [], []);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((entry) => entry.code === "NO_UNIQUE_SELECTION"));
});
