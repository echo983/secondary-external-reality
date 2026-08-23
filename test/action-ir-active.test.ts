import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ActionIrProposer } from "../src/actionIr/proposer.js";
import type { ActionIrSemanticAuditor } from "../src/actionIr/semanticAuditor.js";
import type { ActionProposalEnvelopeV07 } from "../src/actionIr/types.js";
import { validateActionProposal } from "../src/actionIr/validator.js";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

const passingSemantic: ActionIrSemanticAuditor = { async review() { return { verdict: "pass", violations: [] }; } };

function fixedProposal(proposal: ActionProposalEnvelopeV07): ActionIrProposer {
  return { async propose(rawTtd) {
    const validation = validateActionProposal(proposal, rawTtd);
    return { validation, outputHash: createHash("sha256").update(JSON.stringify(proposal)).digest("hex"), model: "test", latencyMs: 1, usage: {} };
  } };
}

function session(store: LanceCommitStore, proposal: ActionProposalEnvelopeV07, semanticAuditor = passingSemantic): BedroomSession {
  return new BedroomSession({ sessionId: "active", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
    actionIr: { mode: "active", proposer: fixedProposal(proposal), semanticAuditor } });
}

test("active IR routes an open paraphrase through the existing commit admission path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-active-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const raw = "我拉动抽屉直到它不再闭合";
    const proposal: ActionProposalEnvelopeV07 = { schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "actions",
      steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }] };
    const turn = await session(store, proposal).submit(raw);
    assert.equal(turn.commitPackage.newWorldCommitments[0]?.kind, "attribute_set");
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.listActionProposalAudits())[0]?.mode, "active");
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("active IR replays current world before every ordered step", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-active-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const raw = "打开抽屉，拿起钥匙，然后把钥匙放进抽屉";
    const proposal: ActionProposalEnvelopeV07 = { schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "actions", steps: [
      { stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} },
      { stepId: "s2", primitive: "take", actor: "self", roles: [{ role: "target", mention: "钥匙" }], modifiers: {} },
      { stepId: "s3", primitive: "put_inside", actor: "self", roles: [{ role: "target", mention: "钥匙" }, { role: "destination", mention: "抽屉" }], modifiers: {} },
    ] };
    const turn = await session(store, proposal).submit(raw);
    assert.equal(turn.partial, false);
    assert.equal((await store.list()).length, 3);
    assert.equal(turn.commitPackages?.length, 3);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("active IR semantic rejection and explicit exits produce zero commits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-active-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const action: ActionProposalEnvelopeV07 = { schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "actions",
      steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }] };
    const rejecting: ActionIrSemanticAuditor = { async review() { return { verdict: "fail", violations: [{ code: "INVENTED", path: "$.steps", message: "invented" }] }; } };
    await assert.rejects(session(store, action, rejecting).submit("看看抽屉是否存在，但不要动它"));
    const exit: ActionProposalEnvelopeV07 = { schemaVersion: "0.8.0", inputLanguage: "zh", exitKind: "not_an_action", steps: [] };
    await assert.rejects(session(store, exit).submit("今天的房间很安静"));
    assert.equal((await store.list()).length, 0);
    assert.deepEqual((await store.listActionProposalAudits()).map((audit) => audit.status), ["rejected", "validated"]);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
