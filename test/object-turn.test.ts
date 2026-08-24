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

test("moves self between the two known landmarks and reports the current position", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-move-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    const beforeMove = MaterializedWorld.replay([], createObjectWorldFixture().seedCommitments);
    assert.equal(beforeMove.entities.get("self")?.attributes.position, "bedside");

    assert.equal((await current.submit("走到门口")).response, "你走到了门口。");
    const atDoorway = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(atDoorway.entities.get("self")?.attributes.position, "doorway");

    assert.equal((await current.submit("走到床边")).response, "你走到了床边。");
    const backAtBedside = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(backAtBedside.entities.get("self")?.attributes.position, "bedside");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires the door to be open before moving into the hallway", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-move-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await assert.rejects(current.submit("走到走廊"), ObjectTurnError);
    assert.equal((await store.list()).length, 0);
    await current.submit("打开门");
    assert.equal((await current.submit("走到走廊")).response, "你走到了走廊。");
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(world.entities.get("self")?.attributes.position, "hallway");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves the hallway's free notable_feature once and keeps it fixed on repeat", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-feature-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("打开门");
    await current.submit("走到走廊");
    const first = await current.submit("环顾四周");
    assert.equal(first.kind, "committed");
    assert.equal(first.commitPackage.newWorldCommitments.length, 1, "first look_around must resolve and commit notable_feature exactly once");
    const second = await current.submit("环顾四周");
    assert.equal(second.kind, "committed");
    assert.equal(second.commitPackage.newWorldCommitments.length, 0, "a second look_around must not re-resolve or re-commit");
    assert.equal(first.response, second.response);
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.match(world.entities.get("hallway-1")?.attributes.notable_feature ?? "", /^(none|framed_photo|umbrella_stand|wall_lamp)$/u);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("hallway is not perceivable through a closed door and commits nothing when queried anyway", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-boundary-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    const closedDoorResult = await current.submit("看看走廊");
    assert.equal(closedDoorResult.kind, "boundary");
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves the same notable_feature whether reached by walking in or observed through an open door", async () => {
  const fixture = createObjectWorldFixture();

  const walkedInDirectory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-walked-"));
  const walkedInStore = new LanceCommitStore(join(walkedInDirectory, "world.lancedb"));
  let walkedInValue: string | undefined;
  try {
    const walkedInSession = session(walkedInStore);
    await walkedInSession.submit("打开门");
    await walkedInSession.submit("走到走廊");
    await walkedInSession.submit("环顾四周");
    const world = MaterializedWorld.replay(await walkedInStore.list(), fixture.seedCommitments);
    walkedInValue = world.entities.get("hallway-1")?.attributes.notable_feature;
  } finally {
    walkedInStore.close();
    await rm(walkedInDirectory, { recursive: true, force: true });
  }

  const observedDirectory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-observed-"));
  const observedStore = new LanceCommitStore(join(observedDirectory, "world.lancedb"));
  let observedValue: string | undefined;
  try {
    const observedSession = session(observedStore);
    await observedSession.submit("打开门");
    const observed = await observedSession.submit("看看走廊");
    // "看看走廊" compiles (on the deterministic path) to a plain "observe",
    // which has no queryKind — regression guard for the bug where the
    // canonical envelope, and therefore the rendered response text, was only
    // built for look_around/self-query, silently leaving observe-compiled
    // hallway queries with an empty response despite committing correctly.
    assert.notEqual(observed.response.trim(), "");
    const world = MaterializedWorld.replay(await observedStore.list(), fixture.seedCommitments);
    observedValue = world.entities.get("hallway-1")?.attributes.notable_feature;
  } finally {
    observedStore.close();
    await rm(observedDirectory, { recursive: true, force: true });
  }

  assert.ok(walkedInValue, "walked-in resolution must have committed a value");
  assert.equal(walkedInValue, observedValue);
});

test("closing the door from the hallway side blocks walking back until it is reopened (bidirectional door regression)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-door-regression-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("打开门");
    await current.submit("走到走廊");
    await current.submit("关上门");
    await assert.rejects(current.submit("走到床边"), ObjectTurnError);
    await assert.rejects(current.submit("走到门口"), ObjectTurnError);
    const stillInHallway = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(stillInHallway.entities.get("self")?.attributes.position, "hallway");
    await current.submit("打开门");
    assert.equal((await current.submit("走到床边")).response, "你走到了床边。");
    const backAtBedside = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    assert.equal(backAtBedside.entities.get("self")?.attributes.position, "bedside");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("living room and hallway each resolve their own independent, non-colliding notable_feature", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-living-room-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("打开门");
    await current.submit("走到走廊");
    const hallwayResult = await current.submit("环顾四周");
    assert.equal(hallwayResult.kind, "committed");
    assert.equal((await current.submit("走到客厅")).response, "你走到了客厅。");
    const livingRoomResult = await current.submit("环顾四周");
    assert.equal(livingRoomResult.kind, "committed");
    assert.equal(livingRoomResult.commitPackage.newWorldCommitments.length, 1, "first look_around in the living room must resolve and commit exactly once");
    const repeat = await current.submit("环顾四周");
    assert.equal(repeat.commitPackage.newWorldCommitments.length, 0, "a second look_around must not re-resolve or re-commit");
    assert.equal(livingRoomResult.response, repeat.response);
    const world = MaterializedWorld.replay(await store.list(), createObjectWorldFixture().seedCommitments);
    const hallwayFeature = world.entities.get("hallway-1")?.attributes.notable_feature;
    const livingRoomFeature = world.entities.get("living-room-1")?.attributes.notable_feature;
    assert.match(hallwayFeature ?? "", /^(none|framed_photo|umbrella_stand|wall_lamp)$/u);
    assert.match(livingRoomFeature ?? "", /^(none|bookshelf|floor_lamp|framed_painting)$/u);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("living room is visible from the hallway without a door, but not reachable or observable from the bedroom directly (no multi-hop)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-living-room-visibility-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await assert.rejects(current.submit("走到客厅"), ObjectTurnError);
    const bedroomBoundary = await current.submit("看看客厅");
    assert.equal(bedroomBoundary.kind, "boundary");
    assert.equal((await store.list()).length, 0);
    await current.submit("打开门");
    await current.submit("走到走廊");
    const fromHallway = await current.submit("看看客厅");
    assert.equal(fromHallway.kind, "committed");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("recalls a freshly written note exactly, forgets it after enough real-world turns pass, but never corrupts the underlying inscription", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-recall-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("拿起笔");
    await current.submit("我在纸条上写下42并藏到枕头下面");
    const read = await current.submit("翻开枕头看看下面，并读纸条");
    assert.match(read.response, /42/);
    const commitsAfterRead = (await store.list()).length;

    const immediate = await current.submit("我还记得纸条上写的是什么");
    assert.equal(immediate.kind, "evidence");
    assert.equal(immediate.response, "你回忆起，纸条上写着“42”。");
    assert.equal((await store.list()).length, commitsAfterRead, "recall must not commit anything");

    await current.submit("打开门");
    await current.submit("走到走廊");
    await current.submit("走到客厅");
    await current.submit("走到走廊");
    await current.submit("走到客厅");

    const faded = await current.submit("我还记得纸条上写的是什么");
    assert.equal(faded.kind, "boundary");
    assert.equal(faded.response, "你努力回想，但已经记不清了。");
    assert.equal((await store.list()).length, 8, "a faded recollection must not commit anything either");

    const rereadAfterFading = await current.submit("翻开枕头看看下面，并读纸条");
    assert.equal(rereadAfterFading.response, "你在枕头下面找到纸条。上面写着“42”。");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("recalling an inscription the player has never read is a distinct boundary from a faded recollection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-recall-never-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    const neverKnew = await current.submit("我还记得纸条上写的是什么");
    assert.equal(neverKnew.kind, "boundary");
    assert.equal(neverKnew.response, "你没有可供查阅的既有证据。");
    assert.equal((await store.list()).length, 0, "a boundary must not commit anything");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects moving to the current position and to a non-landmark destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-move-reject-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await assert.rejects(current.submit("走到床边"), ObjectTurnError);
    assert.equal((await store.list()).length, 0);
    await assert.rejects(current.submit("走到桌子"), ObjectTurnError);
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
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
