import assert from "node:assert/strict";
import test from "node:test";
import { createObjectWorldFixture, resolveFixtureEntity } from "../src/world/objectFixture.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";

test("materializes the reusable bedroom object fixture", () => {
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  assert.equal(world.entities.get("drawer-1")?.attributes.open_state, "closed");
  assert.equal(world.directLocation("key-1")?.objectId, "table-1");
  assert.deepEqual(resolveFixtureEntity(fixture, "桌上的钥匙"), ["key-1", "table-1"]);
  assert.equal(fixture.worldBasis.fixtureVersion, "0.3.0");
  assert.match(fixture.worldBasis.seedHash, /^[a-f0-9]{64}$/);
});
