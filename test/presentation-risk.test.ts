import assert from "node:assert/strict";
import test from "node:test";

import { DeterministicPresentationRenderer, RiskAwarePresentationRenderer, type ApprovedPresentationRenderer } from "../src/presentation/renderer.js";

test("never delegates epistemic boundaries or prior evidence to a low-risk LLM renderer", async () => {
  let calls = 0;
  const unsafe: ApprovedPresentationRenderer = { async render() { calls += 1; return "你在何处"; } };
  const renderer = new RiskAwarePresentationRenderer(unsafe, new DeterministicPresentationRenderer());
  const boundary = { packetId: "b", outcome: "boundary" as const, language: "zh" as const, items: [{ kind: "boundary" as const, code: "TARGET_NOT_PERCEIVABLE" as const }] };
  assert.equal(await renderer.render(boundary, "我在哪里"), "你现在无法感知到目标。");
  const prior = { packetId: "p", outcome: "answer" as const, language: "zh" as const, items: [{ kind: "prior_evidence" as const, acquiredAtCommitSequence: 2, evidence: { kind: "attribute_evidence" as const, semanticAddress: "entity:note.attribute:inscription" as never, value: "42", evidenceId: "e" } }] };
  assert.match(await renderer.render(prior, "写着什么"), /此前获得的证据.*不证明.*现在/u);
  assert.equal(calls, 0);
});

test("allows only low-risk positive presentation through the optional renderer", async () => {
  let calls = 0;
  const lowRisk: ApprovedPresentationRenderer = { async render() { calls += 1; return "safe style"; } };
  const renderer = new RiskAwarePresentationRenderer(lowRisk);
  const packet = { packetId: "p", outcome: "answer" as const, language: "en" as const, items: [{ kind: "observed_entities" as const, entityIds: ["bed-1"] }] };
  assert.equal(await renderer.render(packet, "look"), "safe style");
  assert.equal(calls, 1);
});
