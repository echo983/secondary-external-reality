import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_IR_CORPUS, actionIrCaseMatches } from "../src/eval/actionIrCorpus.js";

test("freezes the bounded-world Action IR milestone corpus", () => {
  assert.equal(ACTION_IR_CORPUS.length, 28);
  assert.equal(ACTION_IR_CORPUS.filter((item) => /[\u3400-\u9fff]/u.test(item.input)).length, 16);
  for (const item of ACTION_IR_CORPUS) {
    assert.equal(actionIrCaseMatches({ exitKind: item.exitKind, steps: item.steps.map((step) => ({ primitive: step.primitive, roles: [...step.roles] })) }, item), true);
  }
});
