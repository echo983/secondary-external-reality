import assert from "node:assert/strict";
import test from "node:test";
import { EntityCatalog, availableAffordances } from "../src/world/entityCatalog.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";
import { ReferenceLexicon } from "../src/world/referenceLexicon.js";

test("builds an extensible catalog and state-derived affordances from fixture data", () => {
  const fixture = createObjectWorldFixture();
  const catalog = new EntityCatalog(fixture);
  assert.equal(catalog.entries.length, 10);
  assert.deepEqual(catalog.entries.find((entry) => entry.entityId === "key-1")?.names, ["钥匙", "key"]);
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  assert.deepEqual(availableAffordances(world.entities.get("drawer-1")!, world), ["observe", "locate", "open"]);
  assert.deepEqual(availableAffordances(world.entities.get("key-1")!, world), ["observe", "locate", "take"]);
});

test("round-trips every approved rendered label and note alias through one lexicon", () => {
  const fixture = createObjectWorldFixture();
  const lexicon = new ReferenceLexicon(fixture);
  for (const entry of new EntityCatalog(fixture).entries) {
    for (const language of ["zh", "en"] as const) assert.deepEqual(lexicon.resolveMention(lexicon.label(entry.entityId, language)), [entry.entityId]);
  }
  assert.deepEqual(lexicon.resolveMention("那张空白便签呢"), ["blank-note-1"]);
});

test("exact and spatial mention resolution strip a leading English article", () => {
  const fixture = createObjectWorldFixture();
  const lexicon = new ReferenceLexicon(fixture);
  assert.deepEqual(lexicon.resolveExactMention("the note"), ["blank-note-1"]);
  assert.deepEqual(lexicon.resolveExactMention("a key"), ["key-1"]);
  assert.deepEqual(lexicon.resolveExactMention("the nightstand"), ["nightstand-1"]);
  assert.deepEqual(lexicon.resolveSpatialMention("the table").entityIds, ["table-1"]);
});
