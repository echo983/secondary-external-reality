import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionClient } from "../src/ai/bedroomAdapters.js";
import { WorkersAiActionIrSemanticAuditor } from "../src/actionIr/semanticAuditor.js";
import type { ActionProposalEnvelopeV07 } from "../src/actionIr/types.js";

const proposal = {
  schemaVersion: "0.7.0", inputLanguage: "zh", exitKind: "actions",
  steps: [{ stepId: "s1", primitive: "open", actor: "self", roles: [{ role: "target", mention: "抽屉" }], modifiers: {} }],
} satisfies ActionProposalEnvelopeV07;

function client(content: string): ChatCompletionClient {
  return { async chat() { return { content, model: "jury", usage: {} }; } };
}

test("semantic auditor accepts a well-formed identity-free verdict", async () => {
  const report = await new WorkersAiActionIrSemanticAuditor(client('{"verdict":"pass","violations":[]}')).review("打开抽屉", proposal);
  assert.equal(report.verdict, "pass");
});

test("semantic auditor fails closed on malformed or contradictory output", async () => {
  await assert.rejects(new WorkersAiActionIrSemanticAuditor(client('```json\n{"verdict":"pass","violations":[]}\n```')).review("打开抽屉", proposal));
  await assert.rejects(new WorkersAiActionIrSemanticAuditor(client('{"verdict":"fail","violations":[]}')).review("打开抽屉", proposal));
});
