import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { CommitPackage, WorldCommitment } from "../src/protocol/types.js";
import { adaptLegacyCommits } from "../src/replay/legacyCanonicalAdapter.js";

const seed: WorldCommitment[] = [
  { kind: "entity_created", entityId: "self", entityType: "person" },
  { kind: "entity_created", entityId: "blank-note-1", entityType: "paper_note" },
];

async function fixture(): Promise<CommitPackage[]> {
  return JSON.parse(await readFile(join(process.cwd(), "test/fixtures/legacy-canonical-history.json"), "utf8")) as CommitPackage[];
}

test("adapts legacy evidence and acquisitions deterministically without reading untyped observations", async () => {
  const input = await fixture();
  const before = structuredClone(input);
  const first = adaptLegacyCommits(input, { seedCommitments: seed });
  const second = adaptLegacyCommits(structuredClone(input).reverse(), { seedCommitments: seed });
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.deepEqual(first.issues, []);
  assert.equal(first.legacyFixedProjections[0]?.classification, "action_resolution");
  assert.equal(first.legacyFixedProjections[0]?.canonicalAddress, undefined);
  assert.deepEqual(first.observations, [{
    observationId: "legacy-observation:0:ZXZpZGVuY2Uv57q45p2h",
    kind: "attribute_perception", observerId: "self",
    semanticAddress: "entity:blank-note-1.attribute:inscription", perceivedValue: "001739",
    sourceOccurrenceId: "legacy-event-read", provenance: "legacy",
  }]);
  assert.equal(first.evidence[0]?.sourceObservationId, first.observations[0]?.observationId);
  assert.deepEqual(first.acquisitions, [{
    acquisitionId: "legacy-acquisition:0:0:c2VsZg", agentId: "self", evidenceId: "evidence/纸条",
    mode: "direct_perception", acquiredAtCommitSequence: 0, provenance: "legacy",
  }]);
});

test("maps entity and relation evidence without inventing extra propositions", () => {
  const commit: CommitPackage = {
    turnId: "t", commitSequence: 0, selectedCandidateId: "c", expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e", type: "action_result", subjectRef: "self" }], stateChanges: [], observations: [], newWorldCommitments: [],
    evidenceGenerated: [
      { evidenceId: "presence", kind: "entity_observed", sourceEventId: "e", subjectId: "blank-note-1" },
      { evidenceId: "location", kind: "relation_observed", sourceEventId: "e", subjectId: "blank-note-1", predicate: "contained_by", objectId: "pillow-1" },
    ],
    epistemicChanges: [
      { agentId: "self", kind: "acquired_evidence", evidenceId: "presence" },
      { agentId: "self", kind: "acquired_evidence", evidenceId: "location" },
    ],
  };
  const result = adaptLegacyCommits([commit], { seedCommitments: [...seed, { kind: "entity_created", entityId: "pillow-1", entityType: "pillow" }] });
  assert.deepEqual(result.issues, []);
  assert.equal(result.evidence[0]?.propositionAddress, undefined);
  assert.deepEqual(result.evidence[0]?.representedValue, ["blank-note-1"]);
  assert.equal(result.evidence[1]?.propositionAddress, "relation-slot:blank-note-1.contained_by");
  assert.equal(result.evidence[1]?.representedValue, "pillow-1");
});

test("reports stable issues for corrupt references and unsafe addresses", () => {
  const broken: CommitPackage = {
    turnId: "broken", commitSequence: 2, selectedCandidateId: "c", expectedProjectionRevisions: {},
    resolvedProjections: [{ projection: "玩家问的位置", value: "x", revision: 1 }],
    events: [], stateChanges: [], observations: [], newWorldCommitments: [],
    evidenceGenerated: [{ evidenceId: "e", kind: "attribute_observed", sourceEventId: "missing", subjectId: "self", attribute: "position", value: "bedside" }],
    epistemicChanges: [{ agentId: "ghost", kind: "acquired_evidence", evidenceId: "missing" }],
  };
  const result = adaptLegacyCommits([broken], { seedCommitments: seed });
  assert.deepEqual(result.issues.map((entry) => entry.code), [
    "NON_CONTIGUOUS_COMMIT_SEQUENCE", "LEGACY_ADDRESS_UNCLASSIFIED", "MISSING_EVIDENCE_EVENT", "MISSING_ACQUISITION_EVIDENCE",
  ]);
});
