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
    for (const [input, code] of [["你好", "CONVERSATION"], ["在 便", "INCOMPLETE_FRAGMENT"], ["看看门外有什么", "UNSUPPORTED_WORLD_SCOPE"], ["在便签上写hello", "UNSUPPORTED_CAPABILITY"]] as const) {
      const result = await session.submit(input);
      assert.equal(result.kind, "interface");
      assert.equal(result.kind === "interface" ? result.code : undefined, code);
    }
    assert.equal((await store.list()).length, 0);
    assert.deepEqual((await store.listTurnAttempts()).map((attempt) => attempt.status), ["interface", "interface", "interface", "interface"]);
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
