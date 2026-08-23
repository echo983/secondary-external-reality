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
