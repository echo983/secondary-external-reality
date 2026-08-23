import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { ObjectTurnError } from "../src/turn/objectTurn.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";

function session(store: LanceCommitStore): BedroomSession {
  return new BedroomSession({ sessionId: "objects", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
}

test("moves a key through hand and drawer with temporal relations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-objects-"));
  const path = join(directory, "world.lancedb");
  let store = new LanceCommitStore(path);
  try {
    const first = session(store);
    assert.match((await first.submit("我拿起桌上的钥匙")).response, /拿起/);
    await assert.rejects(first.submit("我把钥匙放进抽屉"), ObjectTurnError);
    assert.equal((await store.list()).length, 1);
    assert.match((await first.submit("我打开床头柜的抽屉")).response, /打开/);
    assert.match((await first.submit("我把钥匙放进抽屉")).response, /放进/);
    assert.match((await first.submit("我关上抽屉")).response, /关上/);

    store.close();
    store = new LanceCommitStore(path);
    const restarted = session(store);
    await assert.rejects(restarted.submit("我从抽屉取出钥匙"), ObjectTurnError);
    await restarted.submit("我打开抽屉");
    assert.match((await restarted.submit("我找钥匙")).response, /找到/);

    const commits = await store.list();
    const world = MaterializedWorld.replay(commits, createObjectWorldFixture().seedCommitments);
    assert.deepEqual(world.directLocation("key-1"), {
      relationId: "key-1-location-2",
      subjectId: "key-1",
      predicate: "contained_by",
      objectId: "drawer-1",
      setAtSequence: 2,
    });
    assert.equal(world.entities.get("drawer-1")?.attributes.open_state, "open");
    assert.equal(commits.length, 6);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not append an impossible close or ambiguous object action", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-objects-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    await assert.rejects(session(store).submit("我关上抽屉"), ObjectTurnError);
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
