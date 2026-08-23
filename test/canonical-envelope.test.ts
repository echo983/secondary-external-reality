import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalEnvelope } from "../src/protocol/canonicalValidator.js";
import type { CanonicalCommitEnvelopeV1, CommitPackage, WorldCommitment } from "../src/protocol/types.js";
import { replayCanonicalViews } from "../src/replay/canonicalReplay.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

const address = entityAttributeAddress("note-1", "inscription");
function envelope(): CanonicalCommitEnvelopeV1 {
  return {
    schemaVersion: "1.0",
    observations: [{ observationId: "o1", kind: "attribute_perception", observerId: "self", semanticAddress: address, perceivedValue: "42", sourceOccurrenceId: "event-0", provenance: "canonical" }],
    evidence: [{ evidenceId: "e1", propositionAddress: address, representedValue: "42", sourceObservationId: "o1", provenance: "canonical" }],
    acquisitions: [{ acquisitionId: "a1", agentId: "self", evidenceId: "e1", mode: "direct_perception", acquiredAtCommitSequence: 0, provenance: "canonical" }],
    presentationPacket: { packetId: "p1", outcome: "answer", language: "en", items: [{ kind: "attribute_evidence", semanticAddress: address, value: "42", evidenceId: "e1" }] },
  };
}

test("validates closed canonical references and rejects unapproved presentation values", () => {
  const options = { commitSequence: 0, eventIds: new Set(["event-0"]), knownAgentIds: new Set(["self"]) };
  assert.deepEqual(validateCanonicalEnvelope(envelope(), options), []);
  const tampered = envelope();
  const item = tampered.presentationPacket.items[0];
  if (item?.kind === "attribute_evidence") item.value = "hidden-value";
  assert.deepEqual(validateCanonicalEnvelope(tampered, options).map((issue) => issue.code), ["PRESENTATION_EVIDENCE_MISMATCH"]);
});

test("prefers native canonical records without duplicating legacy dual-write fields", () => {
  const seed: WorldCommitment[] = [{ kind: "entity_created", entityId: "self", entityType: "person" }, { kind: "entity_created", entityId: "note-1", entityType: "paper_note" }];
  const commit: CommitPackage = {
    turnId: "t", commitSequence: 0, selectedCandidateId: "c", expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "event-0", type: "action_result", subjectRef: "self", objectRef: "note-1" }], stateChanges: [], observations: [], newWorldCommitments: [],
    evidenceGenerated: [{ evidenceId: "legacy-e", kind: "attribute_observed", sourceEventId: "event-0", subjectId: "note-1", attribute: "inscription", value: "legacy" }],
    epistemicChanges: [{ agentId: "self", kind: "acquired_evidence", evidenceId: "legacy-e" }], canonical: envelope(),
  };
  const views = replayCanonicalViews([commit], { seedCommitments: seed });
  assert.deepEqual(views.issues, []);
  assert.deepEqual(views.evidence.allEvidence().map((record) => record.evidenceId), ["e1"]);
  assert.equal(views.epistemic.allEdges()[0]?.acquiredAtCommitSequence, 0);
});
