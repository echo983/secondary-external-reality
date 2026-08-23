import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ActionIrProposer, ActionProposalResult } from "../src/actionIr/proposer.js";
import { validateActionProposal } from "../src/actionIr/validator.js";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

function result(rawTtd: string, value: unknown): ActionProposalResult {
  const raw = JSON.stringify(value);
  return {
    validation: validateActionProposal(value, rawTtd),
    outputHash: createHash("sha256").update(raw).digest("hex"),
    model: "test-model", latencyMs: 3, usage: { tokens: 7 },
  };
}

function proposer(run: (rawTtd: string) => Promise<ActionProposalResult>): ActionIrProposer {
  return { propose: run };
}

test("shadow proposal is audited without changing the legacy execution result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-shadow-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const shadow = proposer(async (rawTtd) => result(rawTtd, {
      schemaVersion: "0.7.0", inputLanguage: "zh", exitKind: "actions",
      steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }],
    }));
    const session = new BedroomSession({
      sessionId: "shadow", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      actionIr: { mode: "shadow", proposer: shadow },
    });
    const turn = await session.submit("打开抽屉");
    assert.equal(turn.commitPackage.commitSequence, 0);
    assert.equal((await store.list()).length, 1);
    const audits = await store.listActionProposalAudits();
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.status, "validated");
    assert.equal(audits[0]?.proposal !== undefined, true);

    store.close();
    const reopened = new LanceCommitStore(join(directory, "world.lancedb"));
    assert.equal((await reopened.listActionProposalAudits()).length, 1);
    reopened.close();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid or unavailable shadow proposer cannot authorize or block a world commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-shadow-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const bad = proposer(async (rawTtd) => result(rawTtd, {
      schemaVersion: "0.7.0", inputLanguage: "zh", exitKind: "actions", extraAuthority: "append",
      steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }],
    }));
    const first = new BedroomSession({
      sessionId: "bad", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      actionIr: { mode: "shadow", proposer: bad },
    });
    await first.submit("打开抽屉");
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.listActionProposalAudits())[0]?.status, "rejected");

    const unavailable = proposer(async () => { throw new Error("offline"); });
    const second = new BedroomSession({
      sessionId: "offline", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      actionIr: { mode: "shadow", proposer: unavailable },
    });
    await second.submit("关闭抽屉");
    assert.equal((await store.list()).length, 2);
    assert.equal((await store.listActionProposalAudits()).at(-1)?.status, "model_error");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("shadow-only understanding does not bypass the legacy route", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-shadow-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const shadow = proposer(async (rawTtd) => result(rawTtd, {
      schemaVersion: "0.7.0", inputLanguage: "zh", exitKind: "actions",
      steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }],
    }));
    const session = new BedroomSession({
      sessionId: "shadow-only", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      actionIr: { mode: "shadow", proposer: shadow },
    });
    await assert.rejects(session.submit("我尝试让木制抽屉不再保持闭合状态"));
    assert.equal((await store.list()).length, 0);
    assert.equal((await store.listActionProposalAudits())[0]?.status, "validated");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
