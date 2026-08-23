import assert from "node:assert/strict";
import test from "node:test";

import { PRIMITIVE_CONTRACTS } from "../src/actionIr/primitiveContracts.js";
import { ACTION_PRIMITIVES, type ActionProposalEnvelopeV07 } from "../src/actionIr/types.js";
import { parseActionProposalJson, validateActionProposal } from "../src/actionIr/validator.js";

function proposal(overrides: Partial<ActionProposalEnvelopeV07> = {}): ActionProposalEnvelopeV07 {
  return {
    schemaVersion: "0.7.0",
    inputLanguage: "zh",
    exitKind: "actions",
    steps: [{
      stepId: "step-1",
      primitive: "take",
      actor: "self",
      roles: [{ role: "target", mention: "钥匙" }],
      modifiers: {},
    }],
    ...overrides,
  };
}

test("accepts a minimal closed Action IR proposal and clones it", () => {
  const input = proposal();
  const result = validateActionProposal(input, "我拿起钥匙");
  assert.equal(result.valid, true);
  assert.deepEqual(result.proposal, input);
  assert.notEqual(result.proposal, input);
});

test("keeps every primitive in a machine-readable contract registry", () => {
  assert.deepEqual(Object.keys(PRIMITIVE_CONTRACTS).sort(), [...ACTION_PRIMITIVES].sort());
  for (const primitive of ACTION_PRIMITIVES) assert.equal(PRIMITIVE_CONTRACTS[primitive].primitive, primitive);
});

test("rejects malformed, fenced, or unsupported model output", () => {
  assert.deepEqual(parseActionProposalJson("not json", "拿钥匙").issues.map((issue) => issue.code), ["MALFORMED_JSON"]);
  assert.deepEqual(parseActionProposalJson("```json\n{}\n```", "拿钥匙").issues.map((issue) => issue.code), ["MALFORMED_JSON"]);
  const input = proposal() as unknown as Record<string, unknown>;
  (input.steps as Array<Record<string, unknown>>)[0]!.primitive = "destroy_world";
  assert.ok(validateActionProposal(input, "我摧毁世界").issues.some((issue) => issue.code === "UNKNOWN_PRIMITIVE"));
});

test("rejects unknown fields at every protocol level", () => {
  const input = proposal() as unknown as Record<string, unknown>;
  input.newWorldCommitments = [];
  const step = (input.steps as Array<Record<string, unknown>>)[0]!;
  step.entityId = "key-1";
  (step.roles as Array<Record<string, unknown>>)[0]!.canonicalId = "key-1";
  (step.modifiers as Record<string, unknown>).outcome = "success";
  const issues = validateActionProposal(input, "我拿起钥匙").issues;
  assert.equal(issues.filter((issue) => issue.code === "UNKNOWN_FIELD").length, 4);
});

test("requires role mentions to be exact contiguous input spans", () => {
  const input = proposal();
  input.steps[0]!.roles[0]!.mention = "桌上的金钥匙";
  assert.ok(validateActionProposal(input, "我拿起钥匙").issues.some((issue) => issue.code === "MENTION_NOT_IN_INPUT"));
});

test("enforces primitive roles without allowing duplicates or invented roles", () => {
  const input = proposal();
  input.steps[0]!.roles = [
    { role: "target", mention: "钥匙" },
    { role: "target", mention: "钥匙" },
    { role: "destination", mention: "桌子" },
  ];
  const codes = validateActionProposal(input, "我从桌子拿起钥匙").issues.map((issue) => issue.code);
  assert.ok(codes.includes("DUPLICATE_ROLE"));
  assert.ok(codes.includes("ROLE_NOT_ALLOWED"));

  input.steps[0]!.roles = [];
  assert.ok(validateActionProposal(input, "我拿起钥匙").issues.some((issue) => issue.code === "MISSING_REQUIRED_ROLE"));
});

test("enforces step, role, identifier, actor, and modifier bounds", () => {
  const fiveSteps = Array.from({ length: 5 }, (_, index) => ({ ...proposal().steps[0]!, stepId: `s-${index}` }));
  assert.ok(validateActionProposal(proposal({ steps: fiveSteps }), "我拿起钥匙").issues.some((issue) => issue.code === "TOO_MANY_STEPS"));

  const input = proposal();
  input.steps[0]!.stepId = "unsafe id";
  (input.steps[0] as unknown as Record<string, unknown>).actor = "admin";
  (input.steps[0]!.modifiers as Record<string, unknown>).effort = "infinite";
  input.steps[0]!.roles = Array.from({ length: 5 }, () => ({ role: "target" as const, mention: "钥匙" }));
  const codes = validateActionProposal(input, "我拿起钥匙").issues.map((issue) => issue.code);
  assert.ok(codes.includes("INVALID_STEP_ID"));
  assert.ok(codes.includes("INVALID_ACTOR"));
  assert.ok(codes.includes("INVALID_EFFORT"));
  assert.ok(codes.includes("TOO_MANY_ROLES"));
});

test("accepts exact numeric content for write_and_hide without normalizing zeroes", () => {
  const input = proposal({
    steps: [{
      stepId: "write-1",
      primitive: "write_and_hide",
      actor: "self",
      roles: [
        { role: "target", mention: "纸条" },
        { role: "destination", mention: "枕头" },
        { role: "content", mention: "001739" },
      ],
      modifiers: { manner: "careful" },
    }],
  });
  const result = validateActionProposal(input, "我小心地在纸条写下001739并藏到枕头下面");
  assert.equal(result.valid, true);
  assert.equal(result.proposal?.steps[0]?.roles[2]?.mention, "001739");
});

test("represents unsupported and non-action inputs as explicit zero-step exits", () => {
  const unsupported = proposal({ exitKind: "unsupported_action", steps: [] });
  assert.equal(validateActionProposal(unsupported, "老矿工用菜刀砍白桦树").valid, true);
  const notAction = proposal({ exitKind: "not_an_action", steps: [] });
  assert.equal(validateActionProposal(notAction, "要是门开着就好了").valid, true);
  unsupported.steps = proposal().steps;
  assert.ok(validateActionProposal(unsupported, "老矿工用菜刀砍白桦树").issues.some((issue) => issue.code === "STEPS_FOR_NON_ACTION_EXIT"));
});

test("rejects non-numeric write content at the contract boundary", () => {
  const input = proposal({
    steps: [{
      stepId: "write-1", primitive: "write_and_hide", actor: "self",
      roles: [
        { role: "target", mention: "纸条" },
        { role: "destination", mention: "枕头" },
        { role: "content", mention: "秘密" },
      ],
      modifiers: {},
    }],
  });
  assert.ok(validateActionProposal(input, "我把秘密写在纸条并藏到枕头下面").issues.some((issue) => issue.code === "INVALID_LITERAL"));
});
