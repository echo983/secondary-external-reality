import assert from "node:assert/strict";
import test from "node:test";
import type { CommitPackage, WorldCommitment } from "../src/protocol/types.js";
import { MaterializedWorld, MaterializedWorldError } from "../src/world/materializedWorld.js";

function commit(sequence: number, commitments: WorldCommitment[]): CommitPackage {
  return { turnId: `t${sequence}`, commitSequence: sequence, selectedCandidateId: "c", expectedProjectionRevisions: {}, resolvedProjections: [], events: [], stateChanges: [], observations: [], newWorldCommitments: commitments };
}

test("replays an entity, exact inscription, and containment relation", () => {
  const world = MaterializedWorld.replay([commit(0, [
    { kind: "entity_created", entityId: "note-1", entityType: "paper_note" },
    { kind: "entity_created", entityId: "pillow-1", entityType: "pillow" },
    { kind: "attribute_set", entityId: "note-1", attribute: "inscription", value: "001739" },
    { kind: "relation_set", subjectId: "note-1", predicate: "contained_by", objectId: "pillow-1" },
  ])]);
  const found = world.entitiesRelatedTo("contained_by", "pillow-1");
  assert.equal(found[0]?.attributes.inscription, "001739");
});

test("rejects commitments whose subject entity does not exist", () => {
  assert.throws(() => MaterializedWorld.replay([commit(0, [
    { kind: "attribute_set", entityId: "missing", attribute: "inscription", value: "1" },
  ])]), MaterializedWorldError);
});

test("ends one temporal location before asserting another", () => {
  const world = MaterializedWorld.replay([
    commit(0, [
      { kind: "entity_created", entityId: "key-1", entityType: "key" },
      { kind: "entity_created", entityId: "table-1", entityType: "table" },
      { kind: "entity_created", entityId: "self", entityType: "person" },
      { kind: "attribute_set", entityId: "key-1", attribute: "portable", value: "true" },
      { kind: "attribute_set", entityId: "table-1", attribute: "surface", value: "true" },
      { kind: "relation_asserted", relationId: "key-location-0", subjectId: "key-1", predicate: "located_on", objectId: "table-1" },
    ]),
    commit(1, [
      { kind: "relation_ended", relationId: "key-location-0" },
      { kind: "relation_asserted", relationId: "key-location-1", subjectId: "key-1", predicate: "held_by", objectId: "self" },
    ]),
  ]);
  assert.equal(world.entitiesRelatedTo("located_on", "table-1").length, 0);
  assert.equal(world.entitiesRelatedTo("held_by", "self")[0]?.entityId, "key-1");
});

test("rejects simultaneous locations and containment cycles", () => {
  assert.throws(() => MaterializedWorld.replay([commit(0, [
    { kind: "entity_created", entityId: "key-1", entityType: "key" },
    { kind: "entity_created", entityId: "table-1", entityType: "table" },
    { kind: "entity_created", entityId: "self", entityType: "person" },
    { kind: "attribute_set", entityId: "key-1", attribute: "portable", value: "true" },
    { kind: "attribute_set", entityId: "table-1", attribute: "surface", value: "true" },
    { kind: "relation_asserted", relationId: "r1", subjectId: "key-1", predicate: "located_on", objectId: "table-1" },
    { kind: "relation_asserted", relationId: "r2", subjectId: "key-1", predicate: "held_by", objectId: "self" },
  ])]), /active direct location/);

  assert.throws(() => MaterializedWorld.replay([commit(0, [
    { kind: "entity_created", entityId: "box-1", entityType: "container" },
    { kind: "entity_created", entityId: "box-2", entityType: "container" },
    { kind: "relation_asserted", relationId: "r1", subjectId: "box-1", predicate: "contained_by", objectId: "box-2" },
    { kind: "relation_asserted", relationId: "r2", subjectId: "box-2", predicate: "contained_by", objectId: "box-1" },
  ])]), /cycle/);
});

test("rejects relations whose endpoint capabilities are invalid", () => {
  assert.throws(() => MaterializedWorld.replay([commit(0, [
    { kind: "entity_created", entityId: "key-1", entityType: "key" },
    { kind: "entity_created", entityId: "table-1", entityType: "table" },
    { kind: "attribute_set", entityId: "key-1", attribute: "portable", value: "true" },
    { kind: "relation_asserted", relationId: "r1", subjectId: "key-1", predicate: "held_by", objectId: "table-1" },
  ])]), /person object/);

  assert.throws(() => MaterializedWorld.replay([commit(0, [
    { kind: "entity_created", entityId: "key-1", entityType: "key" },
    { kind: "entity_created", entityId: "pillow-1", entityType: "pillow" },
    { kind: "relation_asserted", relationId: "r1", subjectId: "key-1", predicate: "located_on", objectId: "pillow-1" },
  ])]), /surface object/);
});
