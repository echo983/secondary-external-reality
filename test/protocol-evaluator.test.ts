import assert from "node:assert/strict";
import test from "node:test";

import { createJuryBatch, evaluateCandidateEnvelope } from "../src/protocol/evaluator.js";
import { validateCandidateEnvelope } from "../src/protocol/validator.js";
import type {
  CandidateEnvelope,
  ConditionalCandidate,
  ProjectionDefinition,
  ProjectionSnapshot,
} from "../src/protocol/types.js";

const reachProjection = "entity:self.capability.left_hand_cross_body_reach_right_pocket_now";
const teaProjection = "entity:hot_tea.stability_during_cross_body_reach";

const registry: ProjectionDefinition[] = [
  {
    address: reachProjection,
    state: "unknown",
    allowedValues: ["sufficient", "insufficient"],
  },
  {
    address: teaProjection,
    state: "unknown",
    allowedValues: ["stable", "spilled"],
  },
  {
    address: "entity:door.open_state",
    state: "known",
    allowedValues: ["open", "closed"],
    value: "closed",
  },
];

function candidate(
  candidateId: string,
  reach: string,
  tea: string,
  outcomeKind: ConditionalCandidate["outcomeKind"],
): ConditionalCandidate {
  return {
    candidateId,
    outcomeKind,
    requiresResolution: [
      { projection: reachProjection, reason: "Distinguishes whether the key can be reached." },
      { projection: teaProjection, reason: "Distinguishes whether the tea remains stable." },
    ],
    conditions: [
      { projection: reachProjection, operator: "eq", value: reach },
      { projection: teaProjection, operator: "eq", value: tea },
    ],
    proposedEvents:
      outcomeKind === "success"
        ? [
            {
              eventId: `${candidateId}-open-result`,
              type: "action_result",
              actionKind: "open",
              outcome: "success",
            },
          ]
        : [],
    proposedStateChanges:
      outcomeKind === "success"
        ? [
            {
              projection: "entity:door.open_state",
              from: "closed",
              to: "open",
              causedByEventId: `${candidateId}-open-result`,
            },
          ]
        : [],
    observations: [],
    newWorldCommitments: [],
  };
}

function envelope(): CandidateEnvelope {
  return {
    candidates: [
      candidate("success", "sufficient", "stable", "success"),
      candidate("spill", "sufficient", "spilled", "partial"),
      candidate("unreachable", "insufficient", "stable", "failure"),
    ],
  };
}

const successfulSnapshots: ProjectionSnapshot[] = [
  { projection: reachProjection, value: "sufficient", revision: 14 },
  { projection: teaProjection, value: "stable", revision: 15 },
  { projection: "entity:door.open_state", value: "closed", revision: 9 },
];

test("selects only candidates whose committed conditions match", () => {
  const result = evaluateCandidateEnvelope(envelope(), registry, successfulSnapshots);
  assert.equal(result.valid, true);
  assert.deepEqual(result.eligibleCandidateIds, ["success"]);
  assert.deepEqual(
    result.candidates.map(({ candidateId, status }) => ({ candidateId, status })),
    [
      { candidateId: "success", status: "eligible" },
      { candidateId: "spill", status: "ineligible" },
      { candidateId: "unreachable", status: "ineligible" },
    ],
  );
});

test("keeps candidates unresolved until every required projection is committed", () => {
  const result = evaluateCandidateEnvelope(envelope(), registry, successfulSnapshots.slice(0, 1));
  assert.deepEqual(result.eligibleCandidateIds, []);
  assert.ok(result.candidates.every((entry) => entry.status === "unresolved"));
  assert.ok(result.candidates.every((entry) => entry.unresolvedProjections.includes(teaProjection)));
});

test("rejects snapshot values outside the declared projection domain", () => {
  const snapshots = successfulSnapshots.map((snapshot) => ({ ...snapshot }));
  snapshots[0]!.value = "maybe";
  const result = evaluateCandidateEnvelope(envelope(), registry, snapshots);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "SNAPSHOT_VALUE_OUTSIDE_DOMAIN"));
});

test("rejects duplicate snapshots and invalid revisions", () => {
  const snapshots = [
    ...successfulSnapshots,
    { projection: reachProjection, value: "sufficient", revision: -1 },
  ];
  const result = evaluateCandidateEnvelope(envelope(), registry, snapshots);
  const issueCodes = result.issues.map((entry) => entry.code);
  assert.ok(issueCodes.includes("DUPLICATE_SNAPSHOT"));
  assert.ok(issueCodes.includes("INVALID_SNAPSHOT_REVISION"));
});

test("creates a jury batch containing only eligible candidates and revision guards", () => {
  const input = envelope();
  const validation = validateCandidateEnvelope(input, registry);
  const evaluation = evaluateCandidateEnvelope(input, registry, successfulSnapshots);
  const batch = createJuryBatch(input, validation, evaluation, successfulSnapshots);

  assert.deepEqual(batch?.candidates.map((entry) => entry.candidateId), ["success"]);
  assert.deepEqual(batch?.projectionRevisions, {
    [reachProjection]: 14,
    [teaProjection]: 15,
    "entity:door.open_state": 9,
  });
});

test("does not create a jury batch for invalid, unresolved, or empty evaluations", () => {
  const input = envelope();
  const validation = validateCandidateEnvelope(input, registry);
  const unresolved = evaluateCandidateEnvelope(input, registry, []);
  assert.equal(createJuryBatch(input, validation, unresolved, []), null);

  const invalidValidation = { valid: false, issues: validation.issues };
  const evaluated = evaluateCandidateEnvelope(input, registry, successfulSnapshots);
  assert.equal(createJuryBatch(input, invalidValidation, evaluated, successfulSnapshots), null);
});
