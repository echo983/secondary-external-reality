import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";
import { splitActionSequence } from "../src/world/objectIntent.js";

function createSession(store: LanceCommitStore): BedroomSession {
  return new BedroomSession({ sessionId: "sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
}

test("splits only explicit action boundaries", () => {
  assert.deepEqual(splitActionSequence("我打开抽屉，拿起钥匙，然后去开门"), ["我打开抽屉", "拿起钥匙", "去开门"]);
  assert.deepEqual(splitActionSequence("关上抽屉，再把钥匙放进抽屉"), ["关上抽屉", "把钥匙放进抽屉"]);
});

test("commits every successful step against the state produced by the previous step", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-sequence-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const result = await createSession(store).submit("我打开抽屉，拿起桌上的钥匙，然后去开门");
    assert.equal(result.partial, false);
    assert.deepEqual(result.commitPackages?.map((commit) => commit.commitSequence), [0, 1, 2]);
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(world.entities.get("drawer-1")?.attributes.open_state, "open");
    assert.equal(world.entities.get("door-1")?.attributes.open_state, "open");
    assert.equal(world.directLocation("key-1")?.predicate, "held_by");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps prior commits when a later sequence step fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-sequence-"));
  const path = join(directory, "world.lancedb");
  let store = new LanceCommitStore(path);
  try {
    const result = await createSession(store).submit("我打开抽屉，拿起桌上的钥匙，然后关上抽屉，再把钥匙放进抽屉");
    assert.equal(result.partial, true);
    assert.equal(result.commitPackages?.length, 3);
    assert.match(result.response, /前面的动作已经发生/);
    store.close();
    store = new LanceCommitStore(path);
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(world.entities.get("drawer-1")?.attributes.open_state, "closed");
    assert.equal(world.directLocation("key-1")?.predicate, "held_by");
    assert.equal((await store.list()).length, 3);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not turn a first-step failure into partial success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-sequence-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    await assert.rejects(createSession(store).submit("我关上抽屉，然后拿起钥匙"));
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
