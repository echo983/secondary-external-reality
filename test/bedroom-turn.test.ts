import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { ChineseBedroomRenderer, PassingBedroomJury, runBedroomTurn, BedroomTurnError } from "../src/turn/bedroomTurn.js";
import { createBedroomFixture } from "../src/world/bedroomFixture.js";

test("runs the first complete ttd turn and persists it atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-turn-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const result = await runBedroomTurn({
      rawTtd: "我下床去开门",
      turnId: "turn-0",
      commitSequence: 0,
      fixture: createBedroomFixture(),
      jury: new PassingBedroomJury(),
      renderer: new ChineseBedroomRenderer(),
      store,
    });
    assert.match(result.response, /左腿/);
    assert.deepEqual(result.intent.actions.map((action) => action.kind), ["stand", "move", "open"]);
    assert.deepEqual(result.commitPackage.stateChanges.map((change) => change.to), ["standing", "doorway", "open"]);
    assert.deepEqual(await store.list(), [result.commitPackage]);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects unsupported intents before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-turn-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    await assert.rejects(runBedroomTurn({
      rawTtd: "我飞起来",
      turnId: "turn-0",
      commitSequence: 0,
      fixture: createBedroomFixture(),
      jury: new PassingBedroomJury(),
      renderer: new ChineseBedroomRenderer(),
      store,
    }), BedroomTurnError);
    assert.deepEqual(await store.list(), []);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
