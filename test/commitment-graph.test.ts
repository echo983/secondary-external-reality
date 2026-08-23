import assert from "node:assert/strict";
import test from "node:test";

import { buildCommitmentGraph } from "../src/world/commitmentGraph.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";
import type { LegacyFixedProjection } from "../src/world/commitmentTypes.js";

const address = entityAttributeAddress("self", "position");
const projection = (value: string, classification: LegacyFixedProjection["classification"] = "mutable_state_snapshot"): LegacyFixedProjection => ({
  sourceAddress: "entity:self.position", canonicalAddress: address, value, fixedAtCommitSequence: 0, classification, provenance: "legacy_fixed",
});

test("indexes legacy projections without promoting mutable snapshots", () => {
  const built = buildCommitmentGraph([projection("bedside")]);
  assert.deepEqual(built.issues, []);
  assert.equal(built.view.legacyByCanonical(address)[0]?.classification, "mutable_state_snapshot");
  const copy = built.view.allLegacy();
  copy[0]!.value = "mutated";
  assert.equal(built.view.legacyBySource("entity:self.position")?.value, "bedside");
});

test("coalesces equal legacy values and reports conflicting fixed values", () => {
  assert.equal(buildCommitmentGraph([projection("bedside"), projection("bedside")]).view.allLegacy().length, 1);
  const conflict = buildCommitmentGraph([projection("bedside"), projection("doorway")]);
  assert.deepEqual(conflict.issues.map((entry) => entry.code), ["LEGACY_FIXED_VALUE_CONFLICT"]);
  assert.equal(conflict.view.legacyBySource("entity:self.position")?.value, "bedside");
});
