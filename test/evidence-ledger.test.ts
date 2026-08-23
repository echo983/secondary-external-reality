import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceLedger } from "../src/epistemic/evidenceLedger.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";
import type { CanonicalEvidenceRecord, ObservationRecord } from "../src/epistemic/types.js";

const address = entityAttributeAddress("note-1", "inscription");
const observation: ObservationRecord = { observationId: "o1", kind: "attribute_perception", observerId: "self", semanticAddress: address, perceivedValue: "42", sourceOccurrenceId: "event-1", provenance: "legacy" };
const evidence: CanonicalEvidenceRecord = { evidenceId: "e1", propositionAddress: address, representedValue: "42", sourceObservationId: "o1", provenance: "legacy" };

test("builds an immutable evidence ledger with complete observation references", () => {
  const built = buildEvidenceLedger([observation], [evidence]);
  assert.deepEqual(built.issues, []);
  const copy = built.view.evidenceById("e1")!;
  copy.representedValue = "changed";
  assert.equal(built.view.evidenceById("e1")?.representedValue, "42");
});

test("reports duplicate observations, duplicate evidence, and dangling observation references", () => {
  const dangling = { ...evidence, evidenceId: "e2", sourceObservationId: "missing" };
  const built = buildEvidenceLedger([observation, observation], [evidence, evidence, dangling]);
  assert.deepEqual(built.issues.map((entry) => entry.code), [
    "DUPLICATE_OBSERVATION_ID", "DUPLICATE_EVIDENCE_ID", "MISSING_EVIDENCE_OBSERVATION",
  ]);
});
