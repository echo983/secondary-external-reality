import assert from "node:assert/strict";
import test from "node:test";
import { compileInteraction } from "../src/interactionIr/compiler.js";
import type { InteractionEnvelopeV10 } from "../src/interactionIr/types.js";

function envelope(operation: InteractionEnvelopeV10["clauses"][number]["operation"], roles: InteractionEnvelopeV10["clauses"][number]["roles"], speechAct: InteractionEnvelopeV10["speechAct"] = "action_request"): InteractionEnvelopeV10 {
  return { schemaVersion: "1.0.0", inputLanguage: "zh", speechAct, actuality: speechAct === "action_request" ? "actual" : "non_executing",
    clauses: [{ clauseId: "c1", operation, verbSpan: "x", roles }] };
}

test("compiler binds agreed source roles to fixture IDs without deciding capability", () => {
  const result = compileInteraction(envelope("take", [{ role: "target", mention: "桌子" }]), "我拿起桌子");
  assert.equal(result.kind, "executable");
  assert.deepEqual(result.kind === "executable" ? result.steps[0]?.mentionedEntityIds : [], ["table-1"]);
});

test("compiler emits structured slot clarifications and preserves numeric literal", () => {
  assert.deepEqual(compileInteraction(envelope("place", [{ role: "target", mention: "笔" }]), "我放下笔"), { kind: "clarification", code: "MISSING_DESTINATION" });
  assert.deepEqual(compileInteraction(envelope("write", [{ role: "target", mention: "便签" }]), "我写"), { kind: "clarification", code: "INVALID_LITERAL" });
  const written = compileInteraction(envelope("write", [{ role: "target", mention: "便签" }, { role: "content", mention: "2236" }]), "我向便签写2236");
  assert.equal(written.kind, "executable");
  assert.equal(written.kind === "executable" ? written.steps[0]?.objectIntent.content : undefined, "2236");
});

test("compiler derives inscription queries from query mode instead of model operation wording", () => {
  const proposal = envelope("observe", [{ role: "target", mention: "便签" }], "world_query");
  proposal.clauses[0]!.queryMode = "value";
  const result = compileInteraction(proposal, "便签上有什么");
  assert.equal(result.kind === "executable" ? result.steps[0]?.objectIntent.operation : "", "inspect_inscription_value");
});
