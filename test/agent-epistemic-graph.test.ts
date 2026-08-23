import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentEpistemicGraph } from "../src/epistemic/agentGraph.js";
import { buildEvidenceLedger } from "../src/epistemic/evidenceLedger.js";
import type { EpistemicAcquisition, ObservationRecord, CanonicalEvidenceRecord } from "../src/epistemic/types.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

const address = entityAttributeAddress("note-1", "inscription");
const observation: ObservationRecord = { observationId: "o", kind: "attribute_perception", observerId: "agent-a", semanticAddress: address, perceivedValue: "42", sourceOccurrenceId: "event", provenance: "canonical" };
const evidence: CanonicalEvidenceRecord = { evidenceId: "e", propositionAddress: address, representedValue: "42", sourceObservationId: "o", provenance: "canonical" };
const acquisition = (id: string, agentId: string, evidenceId = "e"): EpistemicAcquisition => ({ acquisitionId: id, agentId, evidenceId, mode: "direct_perception", acquiredAtCommitSequence: 0, provenance: "canonical" });

test("keeps agent evidence paths isolated and returns defensive copies", () => {
  const ledger = buildEvidenceLedger([observation], [evidence]).view;
  const built = buildAgentEpistemicGraph([acquisition("a1", "agent-a")], ledger, new Set(["agent-a", "agent-b"]));
  assert.deepEqual(built.issues, []);
  assert.equal(built.view.evidenceFor("agent-a", address).length, 1);
  assert.equal(built.view.evidenceFor("agent-b", address).length, 0);
  const copy = built.view.allEdges();
  copy[0]!.representedValue = "changed";
  assert.equal(built.view.evidenceFor("agent-a", address)[0]?.representedValue, "42");
});

test("reports duplicate acquisitions and dangling evidence or agents", () => {
  const ledger = buildEvidenceLedger([observation], [evidence]).view;
  const built = buildAgentEpistemicGraph([
    acquisition("a1", "agent-a"), acquisition("a1", "agent-a"), acquisition("a2", "agent-a", "missing"), acquisition("a3", "ghost"),
  ], ledger, new Set(["agent-a"]));
  assert.deepEqual(built.issues.map((entry) => entry.code), [
    "DUPLICATE_ACQUISITION_ID", "MISSING_ACQUISITION_EVIDENCE", "MISSING_EPISTEMIC_AGENT",
  ]);
});
