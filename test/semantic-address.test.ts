import assert from "node:assert/strict";
import test from "node:test";

import {
  SemanticAddressError,
  canonicalSemanticAddress,
  entityAttributeAddress,
  parseSemanticAddress,
  relationActiveAddress,
  relationSlotAddress,
  tryUpgradeLegacyAddress,
} from "../src/world/semanticAddress.js";

test("round-trips every canonical semantic address form", () => {
  const addresses = [
    entityAttributeAddress("note-1", "fiber_mark"),
    relationActiveAddress("seed-note-location"),
    relationSlotAddress("note-1", "contained_by"),
  ];
  for (const address of addresses) assert.equal(canonicalSemanticAddress(address), address);
  assert.deepEqual(parseSemanticAddress(addresses[0]!), { kind: "entity_attribute", entityId: "note-1", attribute: "fiber_mark" });
  assert.deepEqual(parseSemanticAddress(addresses[1]!), { kind: "relation_active", relationId: "seed-note-location" });
  assert.deepEqual(parseSemanticAddress(addresses[2]!), { kind: "relation_slot", subjectId: "note-1", predicate: "contained_by" });
});

test("rejects non-canonical tokens and ambiguous address spellings", () => {
  for (const value of [
    "entity:self.position", "entity:Self.attribute:position", "entity:self.attribute:",
    "entity:我.attribute:position", "entity:self.attribute:open.state", "relation:r:1.active",
    "relation-slot:self", " relation:r1.active", "relation:r1.active ",
  ]) assert.throws(() => canonicalSemanticAddress(value), SemanticAddressError);
  assert.throws(() => entityAttributeAddress("self/path", "position"), /canonical semantic token/);
});

test("upgrades only safe legacy entity fields and classifies action resolutions", () => {
  assert.deepEqual(tryUpgradeLegacyAddress("entity:self.position"), {
    sourceAddress: "entity:self.position",
    canonicalAddress: "entity:self.attribute:position",
    classification: "mutable_state_snapshot",
  });
  assert.deepEqual(tryUpgradeLegacyAddress("entity:self.action_outcome.stand_now"), {
    sourceAddress: "entity:self.action_outcome.stand_now",
    classification: "action_resolution",
  });
  assert.deepEqual(tryUpgradeLegacyAddress("玩家问的位置"), {
    sourceAddress: "玩家问的位置",
    classification: "unclassified",
  });
});
