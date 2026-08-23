import assert from "node:assert/strict";
import test from "node:test";

import type { CommitPackage, WorldCommitment } from "../src/protocol/types.js";
import { CanonicalReplayError, replayCanonicalViews } from "../src/replay/canonicalReplay.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

const seed: WorldCommitment[] = [
  { kind: "entity_created", entityId: "self", entityType: "person" },
  { kind: "entity_created", entityId: "note-1", entityType: "paper_note" },
];

function commit(): CommitPackage {
  return {
    turnId: "turn-0", commitSequence: 0, selectedCandidateId: "read", expectedProjectionRevisions: {},
    resolvedProjections: [{ projection: "entity:self.action_outcome.read_now", value: "success", revision: 1 }],
    events: [{ eventId: "read-event", type: "action_result", subjectRef: "self", objectRef: "note-1" }],
    stateChanges: [], observations: [], newWorldCommitments: [],
    evidenceGenerated: [{ evidenceId: "read-evidence", kind: "attribute_observed", sourceEventId: "read-event", subjectId: "note-1", attribute: "inscription", value: "42" }],
    epistemicChanges: [{ agentId: "self", kind: "acquired_evidence", evidenceId: "read-evidence" }],
  };
}

test("rebuilds canonical commitment, evidence, and agent views", () => {
  const result = replayCanonicalViews([commit()], { seedCommitments: seed });
  assert.deepEqual(result.issues, []);
  assert.equal(result.commitments.byClassification("action_resolution").length, 1);
  assert.equal(result.evidence.allEvidence().length, 1);
  assert.equal(result.epistemic.evidenceFor("self", entityAttributeAddress("note-1", "inscription")).length, 1);
});

test("strict replay fails on fatal compatibility issues while diagnostic replay reports them", () => {
  const broken = commit();
  broken.commitSequence = 2;
  assert.throws(() => replayCanonicalViews([broken], { seedCommitments: seed }), CanonicalReplayError);
  const diagnostic = replayCanonicalViews([broken], { seedCommitments: seed, mode: "diagnostic" });
  assert.deepEqual(diagnostic.issues.map((entry) => entry.code), ["NON_CONTIGUOUS_COMMIT_SEQUENCE"]);
});
