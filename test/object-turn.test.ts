import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { ObjectTurnError, runObjectTurn } from "../src/turn/objectTurn.js";
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
    const observed = await restarted.submit("我回来打开抽屉找钥匙");
    assert.match(observed.response, /找到/);
    assert.deepEqual(observed.commitPackage.epistemicChanges, [{
      agentId: "self",
      kind: "acquired_evidence",
      evidenceId: "evidence-location-key-1-4",
    }]);
    assert.equal(observed.commitPackage.evidenceGenerated?.[0]?.objectId, "drawer-1");

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
    assert.equal(commits.length, 5);
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

test("places any configured portable object onto a configured surface", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-objects-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    assert.equal((await current.submit("我拿起床头柜上的笔")).response, "你拿起了笔。");
    assert.equal((await current.submit("我把笔放在桌子上")).response, "你把笔放在桌子上。");
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(world.directLocation("pen-1")?.objectId, "table-1");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("grounds generic placement by destination affordance and treats a bed as a surface", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-placement-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("打开抽屉");
    await current.submit("拿起钥匙");
    assert.match((await current.submit("把钥匙放到抽屉")).response, /放进/u);
    await current.submit("拿出钥匙");
    assert.match((await current.submit("把钥匙放到床上")).response, /床上/u);
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(world.directLocation("key-1")?.predicate, "located_on");
    assert.equal(world.directLocation("key-1")?.objectId, "bed-1");
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("rejects replay under a different world-basis version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-basis-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    await session(store).submit("我拿起桌上的钥匙");
    const fixture = createObjectWorldFixture();
    fixture.worldBasis = { ...fixture.worldBasis, fixtureVersion: "incompatible" };
    await assert.rejects(runObjectTurn({
      rawTtd: "我打开抽屉",
      turnId: "objects:1",
      commitSequence: 1,
      priorCommits: await store.list(),
      jury: new PassingBedroomJury(),
      store,
      fixture,
    }), /world basis does not match/);
    assert.equal((await store.list()).length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
