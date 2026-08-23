import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { BedroomTurnError, ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

test("serializes a session and restores committed state from LanceDB", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-session-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const firstSession = new BedroomSession({ sessionId: "player-1", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    const first = await firstSession.submit("我下床走到门边开门");
    assert.equal(first.commitPackage.commitSequence, 0);

    const restoredSession = new BedroomSession({ sessionId: "player-1", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    await assert.rejects(restoredSession.submit("我下床走到门边开门"), BedroomTurnError);
    assert.equal((await store.list()).length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps concurrent submissions in commit order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-session-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = new BedroomSession({ sessionId: "player-1", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    const results = await Promise.allSettled([
      session.submit("我下床走到门边开门"),
      session.submit("我下床走到门边开门"),
    ]);
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
    assert.equal((await store.list()).length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
