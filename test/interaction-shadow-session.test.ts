import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { InteractionWorkstation } from "../src/interactionIr/workstations.js";
import { validateInteractionProposal } from "../src/interactionIr/validator.js";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";

function fixed(value: unknown): InteractionWorkstation {
  return { async interpret(rawTtd) {
    const output = JSON.stringify(value);
    return { validation: validateInteractionProposal(value, rawTtd), outputHash: createHash("sha256").update(output).digest("hex"),
      model: "test", latencyMs: 1, usage: {} };
  } };
}

const capability = { schemaVersion: "1.0.0", inputLanguage: "zh", speechAct: "capability_query", actuality: "non_executing", clauses: [
  { clauseId: "c1", operation: "take", verbSpan: "拿起", roles: [{ role: "target", mention: "笔" }], queryMode: "capability" },
] };

test("persists Interaction IR consensus beside the unchanged legacy outcome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-shadow-"));
  const path = join(directory, "world.lancedb");
  const store = new LanceCommitStore(path);
  try {
    const session = new BedroomSession({ sessionId: "interaction-shadow", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      interactionIr: { mode: "shadow", left: fixed(capability), right: fixed(capability) } });
    const result = await session.submit("我能拿起笔吗");
    assert.equal(result.kind, "committed");
    assert.equal((await store.list()).length, 1);
    const [audit] = await store.listInteractionIrAudits();
    assert.equal(audit?.status, "agreed");
    assert.equal(audit?.legacyOutcome, "committed");
    assert.equal((audit?.proposal as typeof capability | undefined)?.speechAct, "capability_query");
    assert.equal(audit?.workstations?.length, 2);
    store.close();
    const reopened = new LanceCommitStore(path);
    assert.equal((await reopened.listInteractionIrAudits()).length, 1);
    reopened.close();
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("model or shadow telemetry failure cannot block legacy execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-shadow-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const unavailable: InteractionWorkstation = { async interpret() { throw new Error("offline"); } };
    const session = new BedroomSession({ sessionId: "interaction-shadow-error", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      interactionIr: { mode: "shadow", left: unavailable, right: unavailable } });
    const result = await session.submit("钥匙在哪里");
    assert.equal(result.kind, "committed");
    assert.equal((await store.listInteractionIrAudits())[0]?.status, "model_error");
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("guard mode blocks non-executing or unresolved language but only passes agreed actual actions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-guard-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const capabilitySession = new BedroomSession({ sessionId: "guard-capability", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      interactionIr: { mode: "guard", left: fixed(capability), right: fixed(capability) } });
    const blocked = await capabilitySession.submit("我能拿起笔吗");
    assert.equal(blocked.kind, "interface");
    assert.equal(blocked.kind === "interface" ? blocked.code : undefined, "INTERACTION_CAPABILITY_QUERY");
    assert.equal((await store.list()).length, 0);

    const action = { schemaVersion: "1.0.0", inputLanguage: "zh", speechAct: "action_request", actuality: "actual", clauses: [
      { clauseId: "c1", operation: "take", verbSpan: "拿起", roles: [{ role: "target", mention: "笔" }] },
    ] };
    const actionSession = new BedroomSession({ sessionId: "guard-action", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      interactionIr: { mode: "guard", left: fixed(action), right: fixed(action) } });
    assert.equal((await actionSession.submit("我拿起笔")).kind, "committed");
    assert.equal((await store.list()).length, 1);

    const disagreement = new BedroomSession({ sessionId: "guard-disagreement", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
      interactionIr: { mode: "guard", left: fixed(capability), right: fixed(action) } });
    const unresolved = await disagreement.submit("我能拿起笔吗");
    assert.equal(unresolved.kind, "interface");
    assert.equal(unresolved.kind === "interface" ? unresolved.code : undefined, "INTERACTION_UNRESOLVED");
    assert.equal((await store.list()).length, 1);
    assert.deepEqual((await store.listInteractionIrAudits()).map((audit) => [audit.mode, audit.status, audit.legacyOutcome]), [
      ["guard", "agreed", "interface"], ["guard", "agreed", "committed"], ["guard", "disagreed", "interface"],
    ]);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("active mode compiles agreed open language and fails closed on missing slots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-active-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  const proposal = (raw: string, operation: string, roles: Array<{ role: string; mention: string }>, speechAct = "action_request", queryMode?: string) => ({
    schemaVersion: "1.0.0", inputLanguage: "zh", speechAct, actuality: speechAct === "action_request" ? "actual" : "non_executing",
    clauses: [{ clauseId: "c1", operation, verbSpan: raw.includes("写") ? "写" : raw.includes("在哪") ? "在哪" : raw.includes("放下") ? "放下" : raw.includes("拿起") ? "拿起" : "看", roles, ...(queryMode ? { queryMode } : {}) }],
  });
  const session = (value: unknown) => new BedroomSession({ sessionId: `active-${Math.random()}`, store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
    interactionIr: { mode: "active", left: fixed(value), right: fixed(value) } });
  try {
    const locate = proposal("抽屉在哪", "locate", [{ role: "target", mention: "抽屉" }], "world_query", "location");
    assert.equal((await session(locate).submit("抽屉在哪")).kind, "committed");

    const missingDestination = proposal("我放下笔", "place", [{ role: "target", mention: "笔" }]);
    const clarified = await session(missingDestination).submit("我放下笔");
    assert.equal(clarified.kind === "interface" ? clarified.code : "", "INTERACTION_MISSING_DESTINATION");

    const write = proposal("我向空白便签写2236", "write", [{ role: "target", mention: "空白便签" }, { role: "content", mention: "2236" }]);
    await assert.rejects(session(write).submit("我向空白便签写2236"), /先拿起笔/u);
    const take = proposal("我拿起笔", "take", [{ role: "target", mention: "笔" }]);
    assert.equal((await session(take).submit("我拿起笔")).kind, "committed");
    assert.equal((await session(write).submit("我向空白便签写2236")).kind, "committed");
    const read = proposal("看看便签", "read", [{ role: "target", mention: "便签" }], "world_query", "value");
    const readResult = await session(read).submit("看看便签");
    assert.match(readResult.response, /2236/u);
    assert.equal((await store.listInteractionIrAudits()).every((audit) => audit.mode === "active"), true);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
