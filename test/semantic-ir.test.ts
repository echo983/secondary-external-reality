import assert from "node:assert/strict";
import test from "node:test";
import { compileSemanticIntent, SemanticCompileError } from "../src/semanticIr/compiler.js";
import { normalizeSemanticInput } from "../src/semanticIr/normalization.js";
import type { SemanticEnvelopeV09 } from "../src/semanticIr/types.js";
import { validateSemanticProposal } from "../src/semanticIr/validator.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";

const raw = "纸条上写着什么";
const proposal: SemanticEnvelopeV09 = { schemaVersion: "0.9.0", inputLanguage: "zh", intents: [{ intentId: "s1", kind: "query", verbPhrase: "写着什么", actor: "self", references: [{ role: "target", mention: "纸条" }], query: { mode: "value", aspectMention: "写着" }, modifiers: { negated: false, hypothetical: false, conditional: false } }] };

test("validates source-grounded open semantics and rejects authority fields", () => {
  assert.equal(validateSemanticProposal(proposal, raw).valid, true);
  assert.equal(validateSemanticProposal({ ...proposal, worldCommitments: [] }, raw).valid, false);
  const invented = structuredClone(proposal); invented.intents[0]!.references[0]!.mention = "便签";
  assert.equal(validateSemanticProposal(invented, raw).valid, false);
});

test("compiles semantic queries only through registered capabilities", () => {
  const fixture = createObjectWorldFixture();
  const executable = compileSemanticIntent(proposal.intents[0]!, raw, "zh", fixture, MaterializedWorld.replay([], fixture.seedCommitments));
  assert.equal(executable.capabilityId, "query.inscription.value");
  assert.equal(executable.objectIntent.operation, "inspect_inscription_value");
  const blocked = structuredClone(proposal.intents[0]!); blocked.modifiers.hypothetical = true;
  assert.throws(() => compileSemanticIntent(blocked, raw, "zh", fixture, MaterializedWorld.replay([], fixture.seedCommitments)), SemanticCompileError);
});

test("repairs only deterministic adjacent duplicate CJK characters", () => {
  assert.deepEqual(normalizeSemanticInput("纸纸条上有字吗"), { original: "纸纸条上有字吗", normalized: "纸条上有字吗", repairs: [{ from: "纸纸", to: "纸", index: 0 }] });
  assert.equal(normalizeSemanticInput("钥匙在哪里").normalized, "钥匙在哪里");
});
