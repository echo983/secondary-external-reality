import { createHash } from "node:crypto";
import type { ChatCompletionClient } from "../ai/bedroomAdapters.js";
import { WORKERS_AI_MODELS } from "../ai/workersAiClient.js";
import { parseSemanticProposalJson } from "./validator.js";
import type { SemanticEnvelopeV09, SemanticValidationResult } from "./types.js";

export interface SemanticProposalResult { validation: SemanticValidationResult; outputHash: string; model: string; latencyMs: number; usage: Record<string, unknown> }
export interface SemanticIrProposer { propose(rawTtd: string): Promise<SemanticProposalResult> }
export interface SemanticIrAuditor { review(rawTtd: string, proposal: SemanticEnvelopeV09): Promise<{ verdict: "pass" | "fail"; violations: Array<{ code: string; path: string; message: string }> }> }

export class WorkersAiSemanticIrProposer implements SemanticIrProposer {
  constructor(private readonly client: ChatCompletionClient) {}
  async propose(rawTtd: string): Promise<SemanticProposalResult> {
    const started = Date.now();
    const result = await this.client.chat(WORKERS_AI_MODELS.candidate, [
      { role: "system", content: "Translate the user's meaning into Semantic IR 0.9.0. Return JSON only. Copy verbPhrase, every mention, and aspectMention as exact input spans. Never output entity IDs, types, capabilities, facts, outcomes, or state changes. Kinds: act, perceive, query, communicate, wait, unsupported. Query modes: presence, value, location, contents, inventory. Preserve negated, hypothetical, conditional as booleans. One to four intents, IDs s1-s4, actor self. inputLanguage is exactly zh for Chinese, otherwise en. A request to look at a named entity is perceive with that target and no query. Questions about whether writing exists use presence; what is written use value; where uses location; what is inside uses contents; what is held uses inventory. Valid example for 纸条上写着什么: {\"schemaVersion\":\"0.9.0\",\"inputLanguage\":\"zh\",\"intents\":[{\"intentId\":\"s1\",\"kind\":\"query\",\"verbPhrase\":\"写着什么\",\"actor\":\"self\",\"references\":[{\"role\":\"target\",\"mention\":\"纸条\"}],\"query\":{\"mode\":\"value\",\"aspectMention\":\"写着\"},\"modifiers\":{\"negated\":false,\"hypothetical\":false,\"conditional\":false}}]}. For 请看一下纸条 use kind perceive, verbPhrase 看一下, target 纸条, no query." },
      { role: "user", content: JSON.stringify({ input: rawTtd }) },
    ], { temperature: 0, max_tokens: 1000, chat_template_kwargs: { enable_thinking: false } });
    return { validation: parseSemanticProposalJson(result.content, rawTtd), outputHash: createHash("sha256").update(result.content).digest("hex"), model: result.model, latencyMs: Date.now() - started, usage: result.usage };
  }
}

export class WorkersAiSemanticIrAuditor implements SemanticIrAuditor {
  constructor(private readonly client: ChatCompletionClient) {}
  async review(rawTtd: string, proposal: SemanticEnvelopeV09) {
    const result = await this.client.chat(WORKERS_AI_MODELS.candidate, [
      { role: "system", content: "Check that Semantic IR faithfully preserves the user's action/question, references, query mode, negation, hypothesis and condition. It must not invent meaning. Return JSON only: {verdict:'pass|fail',violations:[{code,path,message}]}" },
      { role: "user", content: JSON.stringify({ rawTtd, proposal }) },
    ], { temperature: 0, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } });
    const value = JSON.parse(result.content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")) as any;
    if ((value.verdict !== "pass" && value.verdict !== "fail") || !Array.isArray(value.violations)) throw new Error("Invalid semantic audit.");
    if (value.verdict === "pass" && value.violations.length) throw new Error("Contradictory semantic audit.");
    return value;
  }
}
