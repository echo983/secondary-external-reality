import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { PaperMemoryTurnError, parsePaperIntent } from "../src/turn/paperMemoryTurn.js";

test("parses exact paper inscriptions without normalizing leading zeroes", () => {
  assert.deepEqual(parsePaperIntent("我在纸条上写下数字001739，然后放在枕头下面"), { kind: "write_and_hide", inscription: "001739" });
  assert.deepEqual(parsePaperIntent("我翻看枕头下面"), { kind: "find_and_read" });
});

test("writes, restarts, finds, and reads the exact inscription", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-paper-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const firstProcess = new BedroomSession({ sessionId: "player", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    const written = await firstProcess.submit("我在纸条上写下数字001739，然后把纸条放在枕头下面");
    assert.match(written.response, /001739/);
    assert.deepEqual(written.commitPackage.newWorldCommitments, [
      { kind: "entity_created", entityId: "note-0", entityType: "paper_note" },
      { kind: "attribute_set", entityId: "note-0", attribute: "inscription", value: "001739" },
      { kind: "relation_set", subjectId: "note-0", predicate: "contained_by", objectId: "pillow-1" },
    ]);
    const unrelated = await firstProcess.submit("我下床走到门边开门");
    assert.equal(unrelated.commitPackage.commitSequence, 1);

    store.close();
    const reopenedStore = new LanceCommitStore(join(directory, "world.lancedb"));
    try {
      const restartedProcess = new BedroomSession({ sessionId: "player", store: reopenedStore, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
      const read = await restartedProcess.submit("我翻开枕头看看下面，并读纸条");
      assert.equal(read.response, "你在枕头下面找到那张纸条。上面写着“001739”。");
      assert.equal(read.commitPackage.commitSequence, 2);
      assert.equal((await reopenedStore.list()).length, 3);
    } finally {
      reopenedStore.close();
    }
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not invent a note when none is under the pillow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-paper-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const session = new BedroomSession({ sessionId: "player", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    await assert.rejects(session.submit("我看看枕头下面"), PaperMemoryTurnError);
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
