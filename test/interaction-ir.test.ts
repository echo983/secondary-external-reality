import assert from "node:assert/strict";
import test from "node:test";
import { interactionConsensus } from "../src/interactionIr/consensus.js";
import { validateInteractionProposal } from "../src/interactionIr/validator.js";
import type { InteractionEnvelopeV10 } from "../src/interactionIr/types.js";
import { runInteractionShadow, type InteractionWorkstation } from "../src/interactionIr/workstations.js";

function proposal(overrides: Partial<InteractionEnvelopeV10> = {}): InteractionEnvelopeV10 {
  return { schemaVersion: "1.0.0", inputLanguage: "zh", speechAct: "capability_query", actuality: "non_executing", clauses: [
    { clauseId: "c1", operation: "take", verbSpan: "拿起", roles: [{ role: "target", mention: "笔" }], queryMode: "capability" },
  ], ...overrides };
}

test("validates a source-grounded capability question without granting execution authority", () => {
  const result = validateInteractionProposal(proposal(), "我能拿起笔吗");
  assert.equal(result.valid, true);
  assert.equal(result.proposal?.speechAct, "capability_query");
  assert.equal(result.proposal?.actuality, "non_executing");
});

test("rejects invented spans, fields, operations, and contradictory actuality", () => {
  const invented = structuredClone(proposal()) as any;
  invented.entityId = "pen-1";
  invented.clauses[0].roles[0].mention = "钢笔";
  invented.clauses[0].operation = "teleport";
  assert.equal(validateInteractionProposal(invented, "我能拿起笔吗").valid, false);
  assert.equal(validateInteractionProposal(proposal({ speechAct: "action_request", actuality: "non_executing" }), "我能拿起笔吗").valid, false);
  assert.equal(validateInteractionProposal(proposal({ speechAct: "conversation", actuality: "actual", clauses: [] }), "我能拿起笔吗").valid, false);
  assert.equal(validateInteractionProposal(proposal({ speechAct: "action_request", actuality: "actual" }), "我能拿起笔吗").valid, false);
});

test("mechanical consensus ignores harmless verb-span differences but rejects material differences", () => {
  const left = proposal();
  const right = proposal({ clauses: [{ ...proposal().clauses[0]!, verbSpan: "拿起笔" }] });
  assert.equal(interactionConsensus(left, right).agreed, true);
  const unsafe = proposal({ speechAct: "action_request", actuality: "actual" });
  assert.equal(interactionConsensus(left, unsafe).agreed, false);
});

test("consensus ignores redundant query modes but preserves compiler-relevant attribute modes", () => {
  const base = proposal({ speechAct: "world_query", clauses: [{ clauseId: "c1", operation: "observe", verbSpan: "看看", roles: [{ role: "target", mention: "门外" }] }] });
  const contents = structuredClone(base); contents.clauses[0]!.queryMode = "contents";
  assert.equal(interactionConsensus(base, contents).agreed, true);
  const value = structuredClone(base); value.clauses[0]!.queryMode = "value";
  assert.equal(interactionConsensus(base, value).agreed, false);
});

test("consensus ignores non-authoritative roles on zero-arity operations", () => {
  const base = proposal({ speechAct: "world_query", clauses: [{ clauseId: "c1", operation: "inventory", verbSpan: "有什么", roles: [], queryMode: "inventory" }] });
  const redundant = structuredClone(base); redundant.clauses[0]!.roles = [{ role: "target", mention: "我手里" }];
  assert.equal(interactionConsensus(base, redundant).agreed, true);
});

test("mechanically erases non-authoritative query modes from actions", () => {
  const action = { schemaVersion: "1.0.0", inputLanguage: "zh", speechAct: "action_request", actuality: "actual", clauses: [
    { clauseId: "c1", operation: "place", verbSpan: "放下", roles: [{ role: "target", mention: "笔" }], queryMode: null },
  ] };
  const result = validateInteractionProposal(action, "我放下笔");
  assert.equal(result.valid, true);
  assert.equal(result.proposal?.clauses[0]?.queryMode, undefined);
  (action.clauses[0] as { queryMode: string | null }).queryMode = "contents";
  const redundant = validateInteractionProposal(action, "我放下笔");
  assert.equal(redundant.valid, true);
  assert.equal(redundant.proposal?.clauses[0]?.queryMode, undefined);
});

test("retries the complete two-workstation consensus once but never accepts one station", async () => {
  const make = (): { workstation: InteractionWorkstation; calls: () => number } => {
    let count = 0;
    return { calls: () => count, workstation: { async interpret(rawTtd) {
      count += 1;
      const validation = count === 1 ? validateInteractionProposal({ malformed: true }, rawTtd) : validateInteractionProposal(proposal(), rawTtd);
      return { validation, outputHash: String(count), model: "test", latencyMs: 0, usage: {} };
    } } };
  };
  const left = make(); const right = make();
  const result = await runInteractionShadow("我能拿起笔吗", left.workstation, right.workstation);
  assert.equal(result.status, "agreed");
  assert.equal(left.calls(), 2);
  assert.equal(right.calls(), 2);
});
