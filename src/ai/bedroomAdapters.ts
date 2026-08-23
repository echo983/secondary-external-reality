import type { ChatMessage, ChatResult } from "./workersAiClient.js";
import { WORKERS_AI_MODELS } from "./workersAiClient.js";
import type { BedroomJury, TurnRenderer } from "../turn/bedroomTurn.js";
import type { CommitPackage, JuryBatch, JuryReport, ValidationIssue } from "../protocol/types.js";
import type { NormalizedIntent } from "../world/intent.js";

export interface ChatCompletionClient {
  chat(model: string, messages: ChatMessage[], extra?: Record<string, unknown>): Promise<ChatResult>;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value: unknown = JSON.parse(unfenced);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return value as Record<string, unknown>;
}

function parseViolations(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) throw new Error("Jury violations must be an array.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid jury violation.");
    const item = entry as Record<string, unknown>;
    if (!["code", "path", "message"].every((key) => typeof item[key] === "string")) {
      throw new Error("Invalid jury violation fields.");
    }
    return { code: item.code as string, path: item.path as string, message: item.message as string };
  });
}

export class WorkersAiBedroomJury implements BedroomJury {
  constructor(private readonly client: ChatCompletionClient) {}

  async review(batch: JuryBatch): Promise<JuryReport[]> {
    const reports: JuryReport[] = [];
    for (const candidate of batch.candidates) {
      const result = await this.client.chat(WORKERS_AI_MODELS.jury, [
        { role: "system", content: "You are a conservative reality-protocol auditor. Return JSON only. Fail only for a concrete contradiction, causal defect, or unsupported commitment inside the candidate. Do not invent world facts and do not choose an outcome." },
        { role: "user", content: JSON.stringify({ task: "audit_candidate", projectionRevisions: batch.projectionRevisions, candidate, output: { candidateId: candidate.candidateId, verdict: "pass|fail", violations: [{ code: "string", path: "string", message: "string" }] } }) },
      ], { temperature: 0, max_tokens: 500 });
      const parsed = parseJsonObject(result.content);
      if (parsed.candidateId !== candidate.candidateId || (parsed.verdict !== "pass" && parsed.verdict !== "fail")) {
        throw new Error("Jury response identity or verdict is invalid.");
      }
      const violations = parseViolations(parsed.violations);
      if (parsed.verdict === "pass" && violations.length !== 0) throw new Error("Passing jury report cannot contain violations.");
      if (parsed.verdict === "fail" && violations.length === 0) throw new Error("Failing jury report requires a violation.");
      reports.push({ candidateId: candidate.candidateId, verdict: parsed.verdict, violations });
    }
    return reports;
  }
}

export class WorkersAiTurnRenderer implements TurnRenderer {
  constructor(private readonly client: ChatCompletionClient, private readonly fallback: TurnRenderer) {}

  async render(commitPackage: CommitPackage, intent: NormalizedIntent): Promise<string> {
    try {
      const result = await this.client.chat(WORKERS_AI_MODELS.candidate, [
        { role: "system", content: "Render committed player-facing events as one brief natural-language response in the same language as the player's input. Mention only supplied events, state changes, and observations. Add no causes, objects, people, sensations, choices, or outcomes. Output plain prose only." },
        { role: "user", content: JSON.stringify({ inputLanguageSample: intent.rawTtd, events: commitPackage.events, stateChanges: commitPackage.stateChanges, observations: commitPackage.observations }) },
      ], { temperature: 0.2, max_tokens: 180, chat_template_kwargs: { enable_thinking: false } });
      return result.content;
    } catch {
      return this.fallback.render(commitPackage, intent);
    }
  }
}
