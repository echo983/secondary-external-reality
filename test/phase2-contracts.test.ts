import assert from "node:assert/strict";
import test from "node:test";

import { supportsScopedAbsence, type ObservationRecord } from "../src/epistemic/types.js";
import type { ApprovedPresentationPacket } from "../src/presentation/types.js";
import type { QueryDecision, QueryRequest } from "../src/query/types.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

const emptyDrawerObservation: ObservationRecord = {
  observationId: "observation-empty-drawer",
  kind: "relation_set_perception",
  observerId: "self",
  predicate: "contained_by",
  objectId: "drawer",
  subjectIds: [],
  completeness: "complete_for_scope",
  scopeRef: { kind: "relation_object", predicate: "contained_by", objectId: "drawer" },
  sourceOccurrenceId: "event-inspect-drawer",
  provenance: "canonical",
};

test("constitutes scoped absence only from a complete matching relation-set observation", () => {
  assert.equal(supportsScopedAbsence(emptyDrawerObservation), true);
  assert.equal(supportsScopedAbsence({ ...emptyDrawerObservation, subjectIds: ["key"] }), false);
  assert.equal(supportsScopedAbsence({
    ...emptyDrawerObservation,
    scopeRef: { kind: "relation_object", predicate: "contained_by", objectId: "other-drawer" },
  }), false);
  const incomplete = { ...emptyDrawerObservation, completeness: undefined } as unknown as ObservationRecord;
  assert.equal(supportsScopedAbsence(incomplete), false);
});

test("keeps prior evidence explicit and ordered in the approved presentation contract", () => {
  const packet: ApprovedPresentationPacket = {
    packetId: "packet-1",
    outcome: "answer",
    language: "zh",
    items: [{
      kind: "prior_evidence",
      acquiredAtCommitSequence: 7,
      evidence: { kind: "attribute_evidence", semanticAddress: entityAttributeAddress("note", "inscription"), value: "001739", evidenceId: "evidence-1" },
    }],
  };
  assert.equal(packet.items[0]?.kind, "prior_evidence");
  assert.equal(packet.items[0]?.kind === "prior_evidence" ? packet.items[0].acquiredAtCommitSequence : undefined, 7);
});

test("separates fixed perception, evidence consultation, and stable boundary decisions", () => {
  const request: QueryRequest = { queryId: "query-1", agentId: "self", kind: "locate", targetEntityId: "note", language: "en" };
  const decisions: QueryDecision[] = [
    { kind: "perceive_fixed_now", request },
    { kind: "consult_acquired_evidence", request, evidenceId: "evidence-1", acquiredAtCommitSequence: 4 },
    { kind: "epistemic_boundary", request, code: "TARGET_NOT_PERCEIVABLE" },
    { kind: "unsupported_boundary", request, code: "UNSUPPORTED_PROJECTION" },
    { kind: "resolution_deferred", request, code: "RESOLUTION_DEFERRED" },
  ];
  assert.deepEqual(decisions.map((decision) => decision.kind), [
    "perceive_fixed_now",
    "consult_acquired_evidence",
    "epistemic_boundary",
    "unsupported_boundary",
    "resolution_deferred",
  ]);
});
