import test from "node:test";
import assert from "node:assert/strict";
import { WorkersAiBedroomJury, WorkersAiTurnRenderer, type ChatCompletionClient } from "../src/ai/bedroomAdapters.js";
import { ChineseBedroomRenderer } from "../src/turn/bedroomTurn.js";
import type { JuryBatch, CommitPackage } from "../src/protocol/types.js";

const candidate = { candidateId: "c1", outcomeKind: "partial" as const, requiresResolution: [], conditions: [], proposedEvents: [], proposedStateChanges: [], observations: [], newWorldCommitments: [] };
const batch: JuryBatch = { projectionRevisions: {}, candidates: [candidate] };

function client(content: string): ChatCompletionClient {
  return { chat: async (model) => ({ model, usage: {}, content }) };
}

test("parses a fenced, identity-bound jury report", async () => {
  const jury = new WorkersAiBedroomJury(client('```json\n{"candidateId":"c1","verdict":"pass","violations":[]}\n```'));
  assert.deepEqual(await jury.review(batch), [{ candidateId: "c1", verdict: "pass", violations: [] }]);
});

test("rejects malformed or contradictory jury output", async () => {
  await assert.rejects(new WorkersAiBedroomJury(client('{"candidateId":"other","verdict":"pass","violations":[]}')).review(batch));
  await assert.rejects(new WorkersAiBedroomJury(client('{"candidateId":"c1","verdict":"fail","violations":[]}')).review(batch));
});

test("uses model prose and falls back when rendering fails", async () => {
  const commit = { turnId: "t", commitSequence: 1, selectedCandidateId: "c1", expectedProjectionRevisions: {}, resolvedProjections: [], events: [], stateChanges: [], observations: [], newWorldCommitments: [] } satisfies CommitPackage;
  const intent = { actorId: "self" as const, rawTtd: "我去开门", actions: [], inputLanguage: "zh" as const };
  const rendered = new WorkersAiTurnRenderer(client("你走到门边。"), new ChineseBedroomRenderer());
  assert.equal(await rendered.render(commit, intent), "你走到门边。");
  const broken: ChatCompletionClient = { chat: async () => { throw new Error("offline"); } };
  assert.match(await new WorkersAiTurnRenderer(broken, new ChineseBedroomRenderer()).render(commit, intent), /左腿/);
});
