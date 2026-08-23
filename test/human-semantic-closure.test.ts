import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

async function withSession(run: (session: BedroomSession, store: LanceCommitStore) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-closure-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try { await run(new BedroomSession({ sessionId: "closure", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() }), store); }
  finally { store.close(); await rm(directory, { recursive: true, force: true }); }
}

test("classifies greetings, fragments, and absent world scope as audited zero-commit interface results", async () => {
  await withSession(async (session, store) => {
    for (const [input, code] of [["你好呀", "CONVERSATION"], ["在 便", "INCOMPLETE_FRAGMENT"], ["看看门外有什么", "UNSUPPORTED_WORLD_SCOPE"], ["在便签上写hello", "UNSUPPORTED_CAPABILITY"]] as const) {
      const result = await session.submit(input);
      assert.equal(result.kind, "interface");
      assert.equal(result.kind === "interface" ? result.code : undefined, code);
    }
    assert.equal((await store.list()).length, 0);
    assert.deepEqual((await store.listTurnAttempts()).map((attempt) => attempt.status), ["interface", "interface", "interface", "interface"]);
  });
});

test("question speech acts take precedence over unsupported arbitrary writing", async () => {
  await withSession(async (session, store) => {
    const result = await session.submit("纸纸条上到底写没写东西");
    assert.equal(result.kind, "committed");
    assert.match(result.response, /没有字/u);
    assert.equal((await store.list()).length, 1);
  });
});

test("opens and inspects the same container without requiring a named portable target", async () => {
  await withSession(async (session, store) => {
    const result = await session.submit("劳驾把抽屉打开看看");
    assert.equal(result.kind, "committed");
    assert.match(result.response, /打开.*抽屉.*空/u);
    assert.equal((await store.list()).length, 1);
  });
});

test("routes high-confidence colloquial perception and location without model interpretation", async () => {
  await withSession(async (session) => {
    const look = await session.submit("我随便瞅瞅这屋里都有啥");
    assert.equal(look.kind, "committed");
    assert.match(look.response, /床.*门.*抽屉/u);
    const inventory = await session.submit("我现在手上都拿了啥呀");
    assert.equal(inventory.kind, "committed");
    assert.match(inventory.response, /没有/u);
    const location = await session.submit("Where exactly did I leave the key?");
    assert.equal(location.kind, "committed");
    assert.match(location.response, /table/iu);
  });
});

test("never executes negated, hypothetical, or conditional language on the deterministic path", async () => {
  await withSession(async (session, store) => {
    for (const input of ["不要打开抽屉", "如果我打开抽屉会怎样", "假装打开抽屉", "What if I open the drawer?"]) {
      const result = await session.submit(input);
      assert.equal(result.kind, "interface");
      assert.equal(result.kind === "interface" ? result.code : undefined, "UNSUPPORTED_MODIFIER");
    }
    assert.equal((await store.list()).length, 0);
  });
});

test("resolves an exposed alias in discourse but rechecks visibility after hiding", async () => {
  await withSession(async (session, store) => {
    await session.submit("看看周围");
    const located = await session.submit("便签呢");
    assert.equal(located.kind, "committed");
    assert.match(located.response, /纸条.*床头柜/u);
    await session.submit("我在便签上写下001739并藏到枕头下面");
    const before = (await store.list()).length;
    const hidden = await session.submit("便签呢");
    assert.equal(hidden.kind, "boundary");
    assert.equal((await store.list()).length, before);
  });
});
