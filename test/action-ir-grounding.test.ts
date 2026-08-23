import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compileGroundedAction } from "../src/actionIr/compiler.js";
import { groundActionProposal } from "../src/actionIr/grounding.js";
import type { ActionProposalEnvelopeV07 } from "../src/actionIr/types.js";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { runObjectTurn } from "../src/turn/objectTurn.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";

function action(primitive: ActionProposalEnvelopeV07["steps"][number]["primitive"], roles: ActionProposalEnvelopeV07["steps"][number]["roles"]): ActionProposalEnvelopeV07 {
  return {
    schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "actions",
    steps: [{ stepId: "s1", primitive, actor: "self", roles, modifiers: {} }],
  };
}

test("grounds exact input mentions to canonical fixture entities", () => {
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  const result = groundActionProposal(action("place", [
    { role: "target", mention: "钥匙" },
    { role: "destination", mention: "床头柜" },
  ]), fixture, world);
  assert.equal(result.ready, true);
  assert.deepEqual(result.steps[0]?.roles.map((role) => [role.role, role.status, role.entityId]), [
    ["target", "resolved", "key-1"],
    ["destination", "resolved", "nightstand-1"],
  ]);
});

test("distinguishes missing, ambiguous, and capability-mismatched references", () => {
  const fixture = createObjectWorldFixture();
  fixture.seedCommitments.push(
    { kind: "entity_created", entityId: "key-2", entityType: "key" },
    { kind: "attribute_set", entityId: "key-2", attribute: "portable", value: "true" },
  );
  fixture.names.push({ entityId: "key-2", names: ["钥匙"] });
  const world = MaterializedWorld.replay([], fixture.seedCommitments);

  const ambiguous = groundActionProposal(action("take", [{ role: "target", mention: "钥匙" }]), fixture, world);
  assert.deepEqual(ambiguous.issues.map((issue) => issue.code), ["AMBIGUOUS_ENTITY_REFERENCE"]);
  assert.deepEqual(ambiguous.issues[0]?.candidateEntityIds, ["key-1", "key-2"]);

  const missing = groundActionProposal(action("take", [{ role: "target", mention: "锤子" }]), fixture, world);
  assert.deepEqual(missing.issues.map((issue) => issue.code), ["UNKNOWN_ENTITY_REFERENCE"]);

  const mismatch = groundActionProposal(action("take", [{ role: "target", mention: "门" }]), fixture, world);
  assert.deepEqual(mismatch.issues.map((issue) => issue.code), ["ROLE_CAPABILITY_MISMATCH"]);
});

test("keeps literal content out of entity resolution", () => {
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  const result = groundActionProposal(action("write_and_hide", [
    { role: "target", mention: "纸条" },
    { role: "destination", mention: "枕头" },
    { role: "content", mention: "001739" },
  ]), fixture, world);
  assert.equal(result.ready, true);
  assert.deepEqual(result.steps[0]?.roles[2], { role: "content", mention: "001739", status: "literal", candidateEntityIds: [], literalValue: "001739" });
});

test("keeps explicit non-action exits outside grounding and compilation", () => {
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay([], fixture.seedCommitments);
  const result = groundActionProposal({ schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "unsupported_action", steps: [] }, fixture, world);
  assert.equal(result.ready, false);
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.issues, []);
});

test("compiles grounded IR into the existing object candidate path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-action-ir-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const fixture = createObjectWorldFixture();
    const world = MaterializedWorld.replay([], fixture.seedCommitments);
    const grounded = groundActionProposal(action("open", [{ role: "target", mention: "抽屉" }]), fixture, world);
    assert.equal(grounded.ready, true);
    const compiled = compileGroundedAction(grounded.steps[0]!, "麻烦帮我把抽屉拉开", "zh");
    const result = await runObjectTurn({
      rawTtd: compiled.intent.rawTtd,
      objectIntent: compiled.intent,
      mentionedEntityIds: compiled.mentionedEntityIds,
      turnId: "ir:0", commitSequence: 0, priorCommits: [], jury: new PassingBedroomJury(), store, fixture,
    });
    assert.equal(result.commitPackage.newWorldCommitments[0]?.kind, "attribute_set");
    const replayed = MaterializedWorld.replay(await store.list(), fixture.seedCommitments);
    assert.equal(replayed.entities.get("drawer-1")?.attributes.open_state, "open");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
