import { randomUUID } from "node:crypto";

import type { BedroomFixture } from "../world/bedroomFixture.js";
import { createBedroomFixture } from "../world/bedroomFixture.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury, CommittedTurnResult, TurnRenderer, TurnResult } from "./bedroomTurn.js";
import { BedroomTurnError, runBedroomTurn } from "./bedroomTurn.js";
import { isObjectIntent, runObjectTurn } from "./objectTurn.js";
import { parseMvpIntent } from "../world/intent.js";
import { parseObjectIntent, splitActionSequence } from "../world/objectIntent.js";
import type { ActionIrProposer } from "../actionIr/proposer.js";
import { createHash } from "node:crypto";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { groundActionProposal } from "../actionIr/grounding.js";
import type { ActionProposalEnvelopeV07, ActionStepProposalV07 } from "../actionIr/types.js";
import type { ActionIrSemanticAuditor } from "../actionIr/semanticAuditor.js";
import { compileGroundedAction } from "../actionIr/compiler.js";
import type { ObjectIntent } from "../world/objectIntent.js";
import type { SemanticIrAuditor, SemanticIrProposer } from "../semanticIr/adapters.js";
import { compileSemanticIntent } from "../semanticIr/compiler.js";
import { normalizeSemanticInput } from "../semanticIr/normalization.js";
import { DeterministicPresentationRenderer, type ApprovedPresentationRenderer } from "../presentation/renderer.js";
import { classifyInterfaceInput, interfaceResponse } from "./inputClassification.js";
import { ReferenceLexicon } from "../world/referenceLexicon.js";
import { DiscourseContext } from "./discourseContext.js";

export interface BedroomSessionOptions {
  sessionId: string;
  store: LanceCommitStore;
  jury: BedroomJury;
  renderer: TurnRenderer;
  fixtureFactory?: () => BedroomFixture;
  actionIr?: { mode: "off" | "shadow" | "active"; proposer?: ActionIrProposer; semanticAuditor?: ActionIrSemanticAuditor };
  semanticIr?: { proposer: SemanticIrProposer; auditor: SemanticIrAuditor };
  queryRenderer?: ApprovedPresentationRenderer;
}

export class BedroomSession {
  private tail: Promise<void> = Promise.resolve();
  private auditRepair: Promise<unknown> | null = null;
  private readonly discourseContext = new DiscourseContext();

  constructor(private readonly options: BedroomSessionOptions) {
    if (!options.sessionId.trim()) throw new Error("Session ID must be non-empty.");
    if (options.actionIr?.mode === "active" && (!options.actionIr.proposer || !options.actionIr.semanticAuditor)) {
      throw new Error("Active Action IR requires both a proposer and semantic auditor.");
    }
  }

  submit(rawTtd: string): Promise<TurnResult> {
    const operation = this.tail.then(
      () => this.submitSerial(rawTtd),
      () => this.submitSerial(rawTtd),
    );
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async submitSerial(rawTtd: string): Promise<TurnResult> {
    this.auditRepair ??= this.options.store.repairTurnAttempts();
    await this.auditRepair;
    const rootTurnId = `${this.options.sessionId}:${randomUUID()}`;
    const priorFocus = this.discourseContext.consumeFocus();
    const interfaceClass = classifyInterfaceInput(rawTtd);
    if (interfaceClass) {
      await this.options.store.appendTurnAttempt({ attemptId: `${rootTurnId}:0`, rootTurnId, stepIndex: 0, stepCount: 1, rawTtd,
        status: "interface", interfaceCode: interfaceClass, createdAt: new Date().toISOString() });
      return { kind: "interface", code: interfaceClass, response: interfaceResponse(interfaceClass, /[\u3400-\u9fff]/u.test(rawTtd)), intent: parseMvpIntent(rawTtd), commitPackage: undefined as never };
    }
    const discourse = this.resolveDiscourseIntent(rawTtd, priorFocus);
    const wholeObjectIntent = parseObjectIntent(rawTtd) ?? discourse?.intent;
    const atomicComposite = wholeObjectIntent?.operation === "write_and_hide" || wholeObjectIntent?.operation === "open_and_observe" || wholeObjectIntent?.operation === "open_and_inspect" || wholeObjectIntent?.operation === "read";
    const steps = atomicComposite ? [rawTtd.trim()] : splitActionSequence(rawTtd);
    const deterministicFastPath = Boolean(discourse) || (steps.length > 0 && steps.every((step) => isObjectIntent(step)));
    const useActiveIr = this.options.actionIr?.mode === "active" && !deterministicFastPath;
    if (useActiveIr && this.options.semanticIr) {
      const semantic = await this.executeSemanticFallback(rawTtd, rootTurnId);
      if (semantic) return semantic;
    }
    const activeProposal = this.options.actionIr?.mode === "shadow" || useActiveIr ? await this.runActionIr(rawTtd, rootTurnId) : null;
    if (useActiveIr) {
      if (!activeProposal) throw new BedroomTurnError(this.failureMessage(rawTtd, "这个尝试目前无法可靠地理解。", "This attempt cannot yet be understood reliably."));
      if (activeProposal.exitKind !== "actions") {
        throw new BedroomTurnError(activeProposal.exitKind === "not_an_action"
          ? this.failureMessage(rawTtd, "这不像是一个要尝试执行的动作。", "This does not look like an action to try.")
          : this.failureMessage(rawTtd, "这个动作还不在当前世界支持的范围内。", "This action is outside the current world's supported scope."));
      }
      return this.executeActiveProposal(rawTtd, rootTurnId, activeProposal);
    }
    if (steps.length <= 1) return this.executeAudited(rawTtd, rootTurnId, 0, 1, discourse?.intent, discourse?.entityIds);

    const completed: CommittedTurnResult[] = [];
    for (const [stepIndex, step] of steps.entries()) {
      try {
        const result = await this.executeAudited(step, rootTurnId, stepIndex, steps.length);
        if (result.kind !== "committed") return result;
        completed.push(result);
      } catch (error) {
        if (completed.length === 0) throw error;
        const chinese = /[\u3400-\u9fff]/u.test(rawTtd);
        const failure = chinese
          ? `前面的动作已经发生，但“${step}”未能完成。`
          : `The earlier actions occurred, but “${step}” could not be completed.`;
        const last = completed.at(-1)!;
        return {
          kind: "committed",
          response: `${completed.map((result) => result.response).join("")} ${failure}`.trim(),
          commitPackage: last.commitPackage,
          commitPackages: completed.flatMap((result) => result.commitPackages ?? [result.commitPackage]),
          intent: parseMvpIntent(rawTtd),
          partial: true,
        };
      }
    }
    const last = completed.at(-1)!;
    return {
      kind: "committed",
      response: completed.map((result) => result.response).join(""),
      commitPackage: last.commitPackage,
      commitPackages: completed.flatMap((result) => result.commitPackages ?? [result.commitPackage]),
      intent: parseMvpIntent(rawTtd),
      partial: false,
    };
  }

  private async executeSemanticFallback(rawTtd: string, rootTurnId: string): Promise<TurnResult | null> {
    const config = this.options.semanticIr!;
    const normalized = normalizeSemanticInput(rawTtd);
    const auditId = `${rootTurnId}:semantic-ir`;
    const inputHash = createHash("sha256").update(rawTtd).digest("hex");
    let stage: "proposal" | "validation" | "audit" | "compile" | "execution" = "proposal";
    let auditWritten = false;
    try {
      const proposed = await config.proposer.propose(normalized.normalized);
      stage = "validation";
      if (!proposed.validation.proposal) {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: "active", inputHash, outputHash: proposed.outputHash,
          status: "rejected", failureStage: stage, validationIssues: proposed.validation.issues,
          groundingIssues: normalized.repairs, semanticIssues: [], model: proposed.model,
          latencyMs: proposed.latencyMs, usage: proposed.usage, createdAt: new Date().toISOString(),
        });
        return null;
      }
      stage = "audit";
      const audit = await config.auditor.review(normalized.normalized, proposed.validation.proposal);
      if (audit.verdict !== "pass") {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: "active", inputHash, outputHash: proposed.outputHash,
          status: "rejected", failureStage: stage, proposal: proposed.validation.proposal,
          validationIssues: proposed.validation.issues, groundingIssues: normalized.repairs,
          semanticIssues: audit.violations, model: proposed.model, latencyMs: proposed.latencyMs,
          usage: proposed.usage, createdAt: new Date().toISOString(),
        });
        return null;
      }
      await this.options.store.appendActionProposalAudit({
        auditId, rootTurnId, mode: "active", inputHash, outputHash: proposed.outputHash,
        status: "validated", proposal: proposed.validation.proposal, validationIssues: proposed.validation.issues,
        groundingIssues: normalized.repairs, semanticIssues: audit.violations, model: proposed.model,
        latencyMs: proposed.latencyMs, usage: proposed.usage, createdAt: new Date().toISOString(),
      });
      auditWritten = true;
      const completed: CommittedTurnResult[] = [];
      for (const [index, intent] of proposed.validation.proposal.intents.entries()) {
        stage = "compile";
        const fixture = createObjectWorldFixture();
        const world = MaterializedWorld.replay(await this.options.store.list(), fixture.seedCommitments);
        const executable = compileSemanticIntent(intent, normalized.normalized, proposed.validation.proposal.inputLanguage, fixture, world);
        stage = "execution";
        const result = await this.executeAudited(rawTtd, rootTurnId, index, proposed.validation.proposal.intents.length, executable.objectIntent, executable.mentionedEntityIds);
        if (result.kind !== "committed") return result;
        completed.push(result);
      }
      const last = completed.at(-1)!;
      return { kind: "committed", response: completed.map((item) => item.response).join(""), commitPackage: last.commitPackage,
        commitPackages: completed.flatMap((item) => item.commitPackages ?? [item.commitPackage]), intent: parseMvpIntent(rawTtd), partial: false };
    } catch (error) {
      if (auditWritten || stage === "compile" || stage === "execution") {
        try {
          await this.options.store.appendActionProposalAudit({
            auditId: `${auditId}:${stage}-error`, rootTurnId, mode: "active", inputHash,
            status: "rejected", failureStage: stage, validationIssues: [], groundingIssues: normalized.repairs,
            semanticIssues: [{ code: "SEMANTIC_IR_STAGE_ERROR", stage, message: error instanceof Error ? error.message : String(error) }],
            createdAt: new Date().toISOString(),
          });
        } catch { /* Diagnostic telemetry cannot affect world admission. */ }
        throw error;
      }
      try {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: "active", inputHash, status: "model_error", failureStage: stage,
          validationIssues: [], groundingIssues: normalized.repairs,
          semanticIssues: [{ code: "SEMANTIC_IR_STAGE_ERROR", stage, message: error instanceof Error ? error.message : String(error) }],
          createdAt: new Date().toISOString(),
        });
      } catch { /* Telemetry failure must not create world state. */ }
      return null;
    }
  }

  private failureMessage(rawTtd: string, zh: string, en: string): string {
    return /[\u3400-\u9fff]/u.test(rawTtd) ? zh : en;
  }

  private async runActionIr(rawTtd: string, rootTurnId: string): Promise<ActionProposalEnvelopeV07 | null> {
    const config = this.options.actionIr;
    if (!config || config.mode === "off" || !config.proposer) return null;
    const auditId = `${rootTurnId}:action-ir`;
    const inputHash = createHash("sha256").update(rawTtd).digest("hex");
    let stage: "proposal" | "validation" | "audit" | "grounding" = "proposal";
    try {
      const result = await config.proposer.propose(rawTtd);
      stage = "validation";
      let groundingIssues: unknown[] = [];
      let semanticIssues: unknown[] = [];
      if (result.validation.proposal) {
        if (config.semanticAuditor) {
          stage = "audit";
          const semantic = await config.semanticAuditor.review(rawTtd, result.validation.proposal);
          semanticIssues = semantic.violations;
        }
        stage = "grounding";
        const fixture = createObjectWorldFixture();
        const world = MaterializedWorld.replay(await this.options.store.list(), fixture.seedCommitments);
        groundingIssues = groundActionProposal(result.validation.proposal, fixture, world).issues;
      }
      const valid = result.validation.valid && groundingIssues.length === 0 && semanticIssues.length === 0;
      const failureStage = !result.validation.valid ? "validation" : semanticIssues.length > 0 ? "audit" : groundingIssues.length > 0 ? "grounding" : undefined;
      await this.options.store.appendActionProposalAudit({
        auditId, rootTurnId, mode: config.mode, inputHash, outputHash: result.outputHash,
        status: valid ? "validated" : "rejected", ...(failureStage ? { failureStage } : {}),
        proposal: result.validation.proposal ?? undefined,
        validationIssues: result.validation.issues, groundingIssues, semanticIssues,
        model: result.model, latencyMs: result.latencyMs, usage: result.usage,
        createdAt: new Date().toISOString(),
      });
      if (!valid) return null;
      return result.validation.proposal;
    } catch (error) {
      try {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: config.mode, inputHash, status: "model_error", failureStage: stage,
          validationIssues: [], groundingIssues: [],
          semanticIssues: [{ code: "ACTION_IR_STAGE_ERROR", stage, message: error instanceof Error ? error.message : String(error) }],
          createdAt: new Date().toISOString(),
        });
      } catch { /* Shadow telemetry cannot affect execution. */ }
      return null;
    }
  }

  private async executeActiveProposal(rawTtd: string, rootTurnId: string, proposal: ActionProposalEnvelopeV07): Promise<TurnResult> {
    const completed: CommittedTurnResult[] = [];
    for (const [stepIndex, step] of proposal.steps.entries()) {
      const fixture = createObjectWorldFixture();
      const commits = await this.options.store.list();
      const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
      const single: ActionProposalEnvelopeV07 = { ...proposal, steps: [structuredClone(step)] };
      const grounded = groundActionProposal(single, fixture, world);
      if (!grounded.ready || !grounded.steps[0]) {
        if (completed.length === 0) throw new BedroomTurnError(this.failureMessage(rawTtd, "动作所指的实体不明确或当前不能这样操作。", "The referenced entity is ambiguous or cannot currently be used that way."));
        return this.partialResult(rawTtd, completed, step);
      }
      const compiled = compileGroundedAction(grounded.steps[0], rawTtd, proposal.inputLanguage);
      try {
        const result = await this.executeAudited(rawTtd, rootTurnId, stepIndex, proposal.steps.length, compiled.intent, compiled.mentionedEntityIds);
        if (result.kind !== "committed") return result;
        completed.push(result);
      } catch (error) {
        if (completed.length === 0) throw error;
        return this.partialResult(rawTtd, completed, step);
      }
    }
    const last = completed.at(-1)!;
    return { kind: "committed", response: completed.map((item) => item.response).join(""), commitPackage: last.commitPackage,
      commitPackages: completed.flatMap((item) => item.commitPackages ?? [item.commitPackage]), intent: parseMvpIntent(rawTtd), partial: false };
  }

  private partialResult(rawTtd: string, completed: CommittedTurnResult[], step: ActionStepProposalV07): CommittedTurnResult {
    const last = completed.at(-1)!;
    const failure = this.failureMessage(rawTtd, `前面的动作已经发生，但“${step.primitive}”未能完成。`, `The earlier actions occurred, but “${step.primitive}” could not be completed.`);
    return { kind: "committed", response: `${completed.map((item) => item.response).join("")} ${failure}`.trim(), commitPackage: last.commitPackage,
      commitPackages: completed.flatMap((item) => item.commitPackages ?? [item.commitPackage]), intent: parseMvpIntent(rawTtd), partial: true };
  }

  private async executeAudited(rawTtd: string, rootTurnId: string, stepIndex: number, stepCount: number, objectIntent?: ObjectIntent, mentionedEntityIds?: string[]): Promise<TurnResult> {
    const attemptId = `${rootTurnId}:${stepIndex}`;
    let result: TurnResult;
    try {
      result = await this.executeSingle(rawTtd, rootTurnId, stepIndex, stepCount, objectIntent, mentionedEntityIds);
    } catch (error) {
      await this.options.store.appendTurnAttempt({
        attemptId, rootTurnId, stepIndex, stepCount, rawTtd,
        status: "failed", failureCode: "ACTION_NOT_COMMITTED",
        createdAt: new Date().toISOString(),
      });
      throw error;
    }
    if (result.kind === "boundary") {
      const boundary = result.packet.items[0];
      await this.options.store.appendTurnAttempt({ attemptId, rootTurnId, stepIndex, stepCount, rawTtd, status: "boundary",
        ...(boundary?.kind === "boundary" ? { boundaryCode: boundary.code } : {}), createdAt: new Date().toISOString() });
    } else if (result.kind === "evidence") {
      await this.options.store.appendTurnAttempt({ attemptId, rootTurnId, stepIndex, stepCount, rawTtd, status: "presented", createdAt: new Date().toISOString() });
    } else {
      await this.options.store.appendTurnAttempt({ attemptId, rootTurnId, stepIndex, stepCount, rawTtd, status: "committed",
        commitSequence: result.commitPackage.commitSequence, selectedCandidateId: result.commitPackage.selectedCandidateId, createdAt: new Date().toISOString() });
    }
    this.recordExposedEntities(result);
    return result;
  }

  private resolveDiscourseIntent(rawTtd: string, priorFocus: readonly string[]): { intent: ObjectIntent; entityIds: string[] } | null {
    const parsed = parseObjectIntent(rawTtd);
    if (/(?:它|\bit\b)/iu.test(rawTtd) && parsed && priorFocus.length === 1) {
      return { intent: parsed, entityIds: [...priorFocus] };
    }
    if (!/(?:呢|where about|what about)\s*[？?]*$/iu.test(rawTtd.trim())) return null;
    const lexicon = new ReferenceLexicon(createObjectWorldFixture());
    const candidates = this.discourseContext.exposedCandidates(lexicon.resolveMention(rawTtd));
    return candidates.length === 1 ? { intent: { operation: "locate", rawTtd: rawTtd.trim(), inputLanguage: /[\u3400-\u9fff]/u.test(rawTtd) ? "zh" : "en" }, entityIds: candidates } : null;
  }

  private recordExposedEntities(result: TurnResult): void {
    if (result.kind !== "committed" || !result.commitPackage.canonical) return;
    const focused: string[] = [];
    for (const item of result.commitPackage.canonical.presentationPacket.items) {
      if (item.kind === "observed_entities") this.discourseContext.expose(item.entityIds);
      if (item.kind === "bounded_relation_set") this.discourseContext.expose([item.objectId, ...item.subjectIds]);
      if (item.kind === "attribute_evidence" || item.kind === "relation_evidence") {
        const subject = String(item.semanticAddress).match(/^(?:entity|relation-slot):([^.]+)/u)?.[1];
        if (subject) { this.discourseContext.expose([subject]); focused.push(subject); }
      }
    }
    this.discourseContext.setFocus(focused.length === 1 ? focused : []);
  }

  private async executeSingle(rawTtd: string, rootTurnId: string, stepIndex: number, stepCount: number, objectIntent?: ObjectIntent, mentionedEntityIds?: string[]): Promise<TurnResult> {
    const commits = await this.options.store.list();
    const fixture = (this.options.fixtureFactory ?? createBedroomFixture)();
    const snapshots = new Map(fixture.committed.map((snapshot) => [snapshot.projection, snapshot]));

    for (const commit of commits) {
      for (const change of commit.stateChanges) {
        const previous = snapshots.get(change.projection);
        if (!previous) continue;
        snapshots.set(change.projection, {
          projection: change.projection,
          value: change.to,
          revision: previous.revision + 1,
        });
      }
    }
    fixture.committed = [...snapshots.values()];

    const commitSequence = commits.length === 0
      ? 0
      : Math.max(...commits.map((commit) => commit.commitSequence)) + 1;
    const bedroomActions = parseMvpIntent(rawTtd).actions.map((action) => action.kind).join(",");
    if (bedroomActions === "stand,move,open") {
      return runBedroomTurn({
        rawTtd,
        turnId: `${this.options.sessionId}:${commitSequence}`,
        commitSequence,
        fixture,
        jury: this.options.jury,
        renderer: this.options.renderer,
        store: this.options.store,
        rootTurnId, stepIndex, stepCount, attemptedTtd: rawTtd,
      });
    }
    if (objectIntent || isObjectIntent(rawTtd)) {
      return runObjectTurn({
        rawTtd,
        turnId: `${this.options.sessionId}:${commitSequence}`,
        commitSequence,
        priorCommits: commits,
        jury: this.options.jury,
        store: this.options.store,
        queryRenderer: this.options.queryRenderer ?? new DeterministicPresentationRenderer(),
        rootTurnId, stepIndex, stepCount, attemptedTtd: rawTtd,
        ...(objectIntent ? { objectIntent } : {}),
        ...(mentionedEntityIds ? { mentionedEntityIds } : {}),
      });
    }
    return runBedroomTurn({
      rawTtd,
      turnId: `${this.options.sessionId}:${commitSequence}`,
      commitSequence,
      fixture,
      jury: this.options.jury,
      renderer: this.options.renderer,
      store: this.options.store,
      rootTurnId, stepIndex, stepCount, attemptedTtd: rawTtd,
    });
  }
}
