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
  constructor(private readonly client: ChatCompletionClient, private readonly role: "world_causality" | "experience_epistemic" = "world_causality") {}

  async review(batch: JuryBatch): Promise<JuryReport[]> {
    const reports: JuryReport[] = [];
    for (const candidate of batch.candidates) {
      const result = await this.client.chat(WORKERS_AI_MODELS.jury, [
        { role: "system", content: this.role === "world_causality"
          ? "You are the world-causality reality auditor. Return JSON only. Fail concrete contradictions in entities, history, preconditions, causality, or commitments. Conditions are PRE-STATE; events and changes are POST-STATE. Do not invent facts or choose outcomes."
          : "You are the experience-epistemic reality auditor. Return JSON only. Fail physically implausible experience, observations unavailable to the actor, or evidence/knowledge not caused by the events. Conditions are PRE-STATE; events and changes are POST-STATE. Do not invent facts or choose outcomes." },
        { role: "user", content: JSON.stringify({ task: "audit_candidate", role: this.role, projectionRevisions: batch.projectionRevisions, candidate, output: { candidateId: candidate.candidateId, verdict: "pass|fail", violations: [{ code: "string", path: "string", message: "string" }] } }) },
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

export class DualRoleBedroomJury implements BedroomJury {
  constructor(private readonly worldCausality: BedroomJury, private readonly experienceEpistemic: BedroomJury) {}

  async review(batch: JuryBatch): Promise<JuryReport[]> {
    const [world, experience] = await Promise.all([
      this.worldCausality.review(batch), this.experienceEpistemic.review(batch),
    ]);
    const expected = batch.candidates.map((candidate) => candidate.candidateId);
    const index = (reports: JuryReport[], role: string): Map<string, JuryReport> => {
      if (reports.length !== expected.length) throw new Error(`${role} jury report count is invalid.`);
      const mapped = new Map(reports.map((report) => [report.candidateId, report]));
      if (mapped.size !== expected.length || expected.some((id) => !mapped.has(id))) throw new Error(`${role} jury identities are invalid.`);
      return mapped;
    };
    const worldById = index(world, "world_causality");
    const experienceById = index(experience, "experience_epistemic");
    return expected.map((candidateId) => {
      const reports = [worldById.get(candidateId)!, experienceById.get(candidateId)!];
      const violations = reports.flatMap((report) => report.violations);
      return { candidateId, verdict: reports.every((report) => report.verdict === "pass") ? "pass" : "fail", violations };
    });
  }
}

const DETERMINISTIC_KERNEL_ACTIONS = new Set([
  "take", "place", "put_inside", "open", "close", "observe", "open_and_observe", "write", "find", "read",
  "look_around", "inventory", "inspect_contents", "locate",
  "inspect_inscription_presence", "inspect_inscription_value",
]);

export class KernelAwareBedroomJury implements BedroomJury {
  constructor(private readonly realityJury: BedroomJury) {}

  async review(batch: JuryBatch): Promise<JuryReport[]> {
    const deterministic: JuryReport[] = [];
    const needsReality = [];
    for (const candidate of batch.candidates) {
      const kernelConstituted = candidate.proposedEvents.length > 0 &&
        candidate.proposedEvents.every((event) => event.actionKind !== undefined && DETERMINISTIC_KERNEL_ACTIONS.has(event.actionKind));
      if (kernelConstituted) deterministic.push({ candidateId: candidate.candidateId, verdict: "pass", violations: [] });
      else needsReality.push(candidate);
    }
    const reviewed = needsReality.length === 0 ? [] : await this.realityJury.review({ ...batch, candidates: needsReality });
    const byId = new Map([...deterministic, ...reviewed].map((report) => [report.candidateId, report]));
    if (byId.size !== batch.candidates.length) throw new Error("Kernel-aware jury did not cover every candidate.");
    return batch.candidates.map((candidate) => byId.get(candidate.candidateId)!);
  }
}

export class WorkersAiTurnRenderer implements TurnRenderer {
  constructor(private readonly client: ChatCompletionClient, private readonly fallback: TurnRenderer) {}

  async render(commitPackage: CommitPackage, intent: NormalizedIntent): Promise<string> {
    try {
      const result = await this.client.chat(WORKERS_AI_MODELS.candidate, [
        { role: "system", content: "Render committed player-facing events as one brief natural-language response in the same language as the player's input. Mention only supplied events, state changes, and observations. Add no causes, objects, people, sensations, choices, or outcomes. Output plain prose only." },
        { role: "user", content: JSON.stringify({ inputLanguageSample: intent.rawTtd, events: commitPackage.events, stateChanges: commitPackage.stateChanges, observations: commitPackage.observations, evidenceGenerated: commitPackage.evidenceGenerated ?? [], epistemicChanges: commitPackage.epistemicChanges ?? [] }) },
      ], { temperature: 0.2, max_tokens: 180, chat_template_kwargs: { enable_thinking: false } });
      return result.content;
    } catch {
      return this.fallback.render(commitPackage, intent);
    }
  }
}
