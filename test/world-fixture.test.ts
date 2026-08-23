import assert from "node:assert/strict";
import test from "node:test";

import { createBedroomFixture, BEDROOM_PROJECTIONS } from "../src/world/bedroomFixture.js";
import { parseMvpIntent } from "../src/world/intent.js";
import { FiniteDomainProjectionResolver, ProjectionResolutionError } from "../src/world/projectionResolver.js";

test("normalizes the first Chinese bedroom action chain", () => {
  const intent = parseMvpIntent("我下床去开门");
  assert.equal(intent.inputLanguage, "zh");
  assert.deepEqual(intent.actions.map(({ kind, targetId }) => ({ kind, targetId })), [
    { kind: "stand", targetId: null },
    { kind: "move", targetId: "door-1" },
    { kind: "open", targetId: "door-1" },
  ]);
});

test("returns an empty action chain for unsupported free text", () => {
  assert.deepEqual(parseMvpIntent("我想知道风从哪里来").actions, []);
});

test("resolves latent fixture projections once and returns stable values", () => {
  const fixture = createBedroomFixture();
  const resolver = new FiniteDomainProjectionResolver(fixture.registry, fixture.committed, fixture.latentValues);
  const first = resolver.resolve(BEDROOM_PROJECTIONS.standOutcome);
  const second = resolver.resolve(BEDROOM_PROJECTIONS.standOutcome);
  assert.deepEqual(first, second);
  assert.equal(first.value, "unstable_success");
  assert.equal(resolver.allSnapshots().length, 4);
});

test("resolves projection sets canonically independent of request order", () => {
  const fixtureA = createBedroomFixture();
  const fixtureB = createBedroomFixture();
  const first = new FiniteDomainProjectionResolver(fixtureA.registry, fixtureA.committed, fixtureA.latentValues);
  const second = new FiniteDomainProjectionResolver(fixtureB.registry, fixtureB.committed, fixtureB.latentValues);
  const addresses = [BEDROOM_PROJECTIONS.moveOutcome, BEDROOM_PROJECTIONS.standOutcome];
  assert.deepEqual(first.resolveMany(addresses), second.resolveMany([...addresses].reverse()));
});

test("rejects unknown and unsupported projections", () => {
  const fixture = createBedroomFixture();
  fixture.registry.push({ address: "entity:self.magic", state: "unsupported", allowedValues: [] });
  const resolver = new FiniteDomainProjectionResolver(fixture.registry, fixture.committed, fixture.latentValues);
  assert.throws(() => resolver.resolve("entity:missing"), ProjectionResolutionError);
  assert.throws(() => resolver.resolve("entity:self.magic"), ProjectionResolutionError);
});
