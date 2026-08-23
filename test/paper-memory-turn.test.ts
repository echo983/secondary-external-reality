import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { ObjectTurnError } from "../src/turn/objectTurn.js";
import { parseObjectIntent } from "../src/world/objectIntent.js";
import type { CommitPackage } from "../src/protocol/types.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";

test("parses exact paper inscriptions without normalizing leading zeroes", () => {
  assert.equal(parseObjectIntent("我在纸条上写下数字001739，然后放在枕头下面")?.operation, "write_and_hide");
  assert.equal(parseObjectIntent("我翻看枕头下面")?.operation, "read");
});

test("writes, restarts, finds, and reads the exact inscription", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-paper-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const firstProcess = new BedroomSession({ sessionId: "player", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
    const written = await firstProcess.submit("我在纸条上写下数字001739，然后把纸条放在枕头下面");
    assert.match(written.response, /001739/);
    assert.deepEqual(written.commitPackage.newWorldCommitments, [
      { kind: "attribute_set", entityId: "blank-note-1", attribute: "inscription", value: "001739" },
      { kind: "relation_ended", relationId: "seed-note-location" },
      { kind: "relation_asserted", relationId: "blank-note-1-location-0", subjectId: "blank-note-1", predicate: "contained_by", objectId: "pillow-1" },
    ]);
    const unrelated = await firstProcess.submit("我下床走到门边开门");
    assert.equal(unrelated.commitPackage.commitSequence, 1);

    store.close();
    const reopenedStore = new LanceCommitStore(join(directory, "world.lancedb"));
    try {
      const restartedProcess = new BedroomSession({ sessionId: "player", store: reopenedStore, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
      const read = await restartedProcess.submit("我翻开枕头看看下面，并读纸条");
      assert.equal(read.response, "你在枕头下面找到纸条。上面写着“001739”。");
      assert.equal(read.commitPackage.evidenceGenerated?.find((evidence) => evidence.kind === "attribute_observed")?.value, "001739");
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
    await assert.rejects(session.submit("我看看枕头下面"), ObjectTurnError);
    assert.equal((await store.list()).length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("reads a legacy paper commit that predates world-basis metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-paper-legacy-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const legacy: CommitPackage = {
      turnId: "legacy:0", commitSequence: 0, selectedCandidateId: "legacy-paper",
      expectedProjectionRevisions: {}, resolvedProjections: [], events: [], stateChanges: [], observations: [],
      newWorldCommitments: [
        { kind: "entity_created", entityId: "note-0", entityType: "paper_note" },
        { kind: "attribute_set", entityId: "note-0", attribute: "inscription", value: "0042" },
        { kind: "relation_set", subjectId: "note-0", predicate: "contained_by", objectId: "pillow-1" },
      ],
    };
    await store.append(legacy, { seedCommitments: createObjectWorldFixture().seedCommitments });
    const read = await new BedroomSession({ sessionId: "player", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() }).submit("我看看枕头下面并读纸条");
    assert.match(read.response, /0042/);
    assert.equal(read.commitPackage.worldBasis?.fixtureVersion, "0.3.0");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
