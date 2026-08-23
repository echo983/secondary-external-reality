import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

function createSession(store: LanceCommitStore): BedroomSession {
  return new BedroomSession({ sessionId: "observation", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
}

test("looks around without leaking hidden contents or inscriptions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-observe-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = createSession(store);
    await session.submit("我在纸条上写下001739并藏到枕头下面");
    const looked = await session.submit("看能看到什么");
    assert.match(looked.response, /床|桌子|抽屉/u);
    assert.doesNotMatch(looked.response, /001739/u);
    assert.doesNotMatch(looked.response, /纸条/u);
    assert.deepEqual(looked.commitPackage.stateChanges, []);
    assert.deepEqual(looked.commitPackage.newWorldCommitments, []);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("closed containers hide contents and open containers expose committed contents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-observe-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = createSession(store);
    await assert.rejects(session.submit("抽屉里有什么"));
    await session.submit("打开抽屉");
    assert.match((await session.submit("抽屉里有什么")).response, /空/u);
    await session.submit("拿起钥匙");
    await session.submit("把钥匙放进抽屉");
    assert.match((await session.submit("抽屉里有什么")).response, /钥匙/u);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("locates only visible objects and reports held inventory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-observe-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = createSession(store);
    assert.match((await session.submit("钥匙在哪里")).response, /桌子上/u);
    assert.match((await session.submit("我手里有什么")).response, /没有/u);
    await session.submit("拿起钥匙");
    assert.match((await session.submit("我手里有什么")).response, /钥匙/u);
    assert.match((await session.submit("钥匙在哪里")).response, /手里/u);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("distinguishes blank inscription presence from exact inscription value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-observe-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = createSession(store);
    assert.equal((await session.submit("纸条上有字吗")).response, "纸条上没有字。");
    assert.equal((await session.submit("纸条上写着什么")).response, "纸条上没有字。");
    await session.submit("我在纸条上写下001739并藏到枕头下面");
    await assert.rejects(session.submit("纸条上写着什么"));
    assert.match((await session.submit("我找到枕头下的纸条并读它")).response, /001739/u);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
