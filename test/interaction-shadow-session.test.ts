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
