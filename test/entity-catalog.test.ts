import assert from "node:assert/strict";
import test from "node:test";
import { EntityCatalog, availableAffordances } from "../src/world/entityCatalog.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";

test("builds an extensible catalog and state-derived affordances from fixture data", () => {
  const fixture = createObjectWorldFixture();
  const catalog = new EntityCatalog(fixture);
  assert.equal(catalog.entries.length, 10);
  assert.deepEqual(catalog.entries.find((entry) => entry.entityId === "key-1")?.names, ["钥匙", "key"]);
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  assert.deepEqual(availableAffordances(world.entities.get("drawer-1")!, world), ["observe", "locate", "open"]);
  assert.deepEqual(availableAffordances(world.entities.get("key-1")!, world), ["observe", "locate", "take"]);
});
