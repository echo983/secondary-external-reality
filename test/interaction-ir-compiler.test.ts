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

test("compiler resolves a target mention that carries a trailing Chinese locative particle", () => {
  const observed = compileInteraction(envelope("observe", [{ role: "target", mention: "抽屉里" }], "world_query"), "抽屉里有什么");
  assert.equal(observed.kind, "executable");
  assert.deepEqual(observed.kind === "executable" ? observed.steps[0]?.mentionedEntityIds : [], ["drawer-1"]);

  const onSurface = compileInteraction(envelope("observe", [{ role: "target", mention: "桌子上" }], "world_query"), "桌子上有什么");
  assert.equal(onSurface.kind, "executable");
  assert.deepEqual(onSurface.kind === "executable" ? onSurface.steps[0]?.mentionedEntityIds : [], ["table-1"]);
});

test("compiler resolves the bare English pronoun \"I\" as self for locate", () => {
  const result = compileInteraction(envelope("locate", [{ role: "target", mention: "I" }], "world_query"), "where am I");
  assert.equal(result.kind, "executable");
  assert.deepEqual(result.kind === "executable" ? result.steps[0]?.mentionedEntityIds : [], ["self"]);
});

test("compiler resolves English target, instrument and destination mentions that carry a leading article", () => {
  const located = compileInteraction(envelope("locate", [{ role: "target", mention: "the note" }], "world_query"), "where is the note");
  assert.equal(located.kind, "executable");
  assert.deepEqual(located.kind === "executable" ? located.steps[0]?.mentionedEntityIds : [], ["blank-note-1"]);

  const taken = compileInteraction(envelope("take", [{ role: "target", mention: "a key" }]), "pick up a key");
  assert.equal(taken.kind, "executable");
  assert.deepEqual(taken.kind === "executable" ? taken.steps[0]?.mentionedEntityIds : [], ["key-1"]);

  const placed = compileInteraction(envelope("place", [{ role: "target", mention: "the pen" }, { role: "destination", mention: "the table" }]), "put the pen on the table");
  assert.equal(placed.kind, "executable");
  assert.deepEqual(placed.kind === "executable" ? placed.steps[0]?.mentionedEntityIds.sort() : [], ["pen-1", "table-1"]);
});

test("compiler emits structured slot clarifications and preserves numeric literal", () => {
  assert.deepEqual(compileInteraction(envelope("place", [{ role: "target", mention: "笔" }]), "我放下笔"), { kind: "clarification", code: "MISSING_DESTINATION" });
  assert.deepEqual(compileInteraction(envelope("write", [{ role: "target", mention: "便签" }]), "我写"), { kind: "clarification", code: "INVALID_LITERAL" });
  const written = compileInteraction(envelope("write", [{ role: "target", mention: "便签" }, { role: "content", mention: "2236" }]), "我向便签写2236");
  assert.equal(written.kind, "executable");
  assert.equal(written.kind === "executable" ? written.steps[0]?.objectIntent.content : undefined, "2236");
});

test("compiler extracts a quoted digit literal a person naturally wraps or prefixes what they want written with", () => {
  // Found live against the real model (docs/DEMO-PHASE-plan-v1.0.md §3.2):
  // both interaction-IR workstations faithfully copy quote marks — and
  // sometimes a leading descriptive word like 数字 — as part of the exact
  // contiguous mention span when someone writes 写上"1234" or 写上数字"1234"。
  // The digit check has to look past that, not assume it away.
  const curly = compileInteraction(envelope("write", [{ role: "target", mention: "纸条" }, { role: "content", mention: "“1234”" }]), "我把纸条写上“1234”");
  assert.equal(curly.kind, "executable");
  assert.equal(curly.kind === "executable" ? curly.steps[0]?.objectIntent.content : undefined, "1234");

  const straight = compileInteraction(envelope("write", [{ role: "target", mention: "note" }, { role: "content", mention: '"5678"' }]), 'write "5678" on the note');
  assert.equal(straight.kind, "executable");
  assert.equal(straight.kind === "executable" ? straight.steps[0]?.objectIntent.content : undefined, "5678");

  const prefixed = compileInteraction(envelope("write", [{ role: "target", mention: "纸条" }, { role: "content", mention: "数字“1234”" }]), "我把数字“1234”写在纸条上");
  assert.equal(prefixed.kind, "executable");
  assert.equal(prefixed.kind === "executable" ? prefixed.steps[0]?.objectIntent.content : undefined, "1234");

  // A lone, unmatched quote character is not stripped — it stays part of the
  // literal and correctly fails the digit check, since there is no real
  // quoted span.
  assert.deepEqual(compileInteraction(envelope("write", [{ role: "target", mention: "便签" }, { role: "content", mention: "12”34" }]), "x"), { kind: "clarification", code: "INVALID_LITERAL" });

  // A second, different digit run outside the quotes makes the mention
  // genuinely ambiguous — not guessed at, correctly rejected.
  assert.deepEqual(compileInteraction(envelope("write", [{ role: "target", mention: "便签" }, { role: "content", mention: "第2组“1234”" }]), "x"), { kind: "clarification", code: "INVALID_LITERAL" });
});

test("compiler derives inscription queries from query mode instead of model operation wording", () => {
  const proposal = envelope("observe", [{ role: "target", mention: "便签" }], "world_query");
  proposal.clauses[0]!.queryMode = "value";
  const result = compileInteraction(proposal, "便签上有什么");
  assert.equal(result.kind === "executable" ? result.steps[0]?.objectIntent.operation : "", "inspect_inscription_value");
});

test("compiler now resolves 门外 to the hallway Place entity", () => {
  const proposal = envelope("observe", [{ role: "target", mention: "门外" }], "world_query");
  proposal.clauses[0]!.queryMode = "contents";
  const result = compileInteraction(proposal, "看看门外");
  assert.equal(result.kind, "executable");
  assert.deepEqual(result.kind === "executable" ? result.steps[0]?.mentionedEntityIds : [], ["hallway-1"]);
});

test("compiler treats inventory as zero-arity even when a workstation emits a redundant role", () => {
  const proposal = envelope("inventory", [{ role: "target", mention: "我手里" }], "world_query");
  proposal.clauses[0]!.queryMode = "inventory";
  const result = compileInteraction(proposal, "我手里有什么");
  assert.deepEqual(result.kind === "executable" ? result.steps[0]?.mentionedEntityIds : null, []);
});

test("compiler compiles move to a resolvable landmark and still requires a destination", () => {
  const proposal = envelope("move", [{ role: "destination", mention: "门口" }]);
  const result = compileInteraction(proposal, "走到门口");
  assert.equal(result.kind, "executable");
  assert.deepEqual(result.kind === "executable" ? result.steps[0]?.mentionedEntityIds : [], ["door-1"]);
  assert.deepEqual(compileInteraction(envelope("move", []), "走"), { kind: "clarification", code: "MISSING_DESTINATION" });
});

test("compiler separates spatial suffixes from destination entities", () => {
  const inside = compileInteraction(envelope("place", [{ role: "target", mention: "钥匙" }, { role: "destination", mention: "抽屉里" }]), "把钥匙放到抽屉里");
  assert.equal(inside.kind === "executable" ? inside.steps[0]?.objectIntent.operation : "", "put_inside");
  assert.deepEqual(inside.kind === "executable" ? inside.steps[0]?.mentionedEntityIds : [], ["key-1", "drawer-1"]);
  const on = compileInteraction(envelope("place", [{ role: "target", mention: "钥匙" }, { role: "destination", mention: "床上" }]), "把钥匙放到床上");
  assert.equal(on.kind === "executable" ? on.steps[0]?.objectIntent.placementRelation : undefined, "on");
});
