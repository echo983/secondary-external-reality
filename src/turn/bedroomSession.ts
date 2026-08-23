import { randomUUID } from "node:crypto";

import type { BedroomFixture } from "../world/bedroomFixture.js";
import { createBedroomFixture } from "../world/bedroomFixture.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury, TurnRenderer, TurnResult } from "./bedroomTurn.js";
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

export interface BedroomSessionOptions {
  sessionId: string;
  store: LanceCommitStore;
  jury: BedroomJury;
  renderer: TurnRenderer;
  fixtureFactory?: () => BedroomFixture;
  actionIr?: { mode: "off" | "shadow" | "active"; proposer?: ActionIrProposer; semanticAuditor?: ActionIrSemanticAuditor };
}

export class BedroomSession {
  private tail: Promise<void> = Promise.resolve();
  private auditRepair: Promise<unknown> | null = null;

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
    const wholeObjectIntent = parseObjectIntent(rawTtd);
    const atomicComposite = wholeObjectIntent?.operation === "write_and_hide" || wholeObjectIntent?.operation === "open_and_observe" || wholeObjectIntent?.operation === "read";
    const steps = atomicComposite ? [rawTtd.trim()] : splitActionSequence(rawTtd);
    const rootTurnId = `${this.options.sessionId}:${randomUUID()}`;
    const activeProposal = await this.runActionIr(rawTtd, rootTurnId);
    if (this.options.actionIr?.mode === "active") {
      if (!activeProposal) throw new BedroomTurnError(this.failureMessage(rawTtd, "这个尝试目前无法可靠地理解。", "This attempt cannot yet be understood reliably."));
      if (activeProposal.exitKind !== "actions") {
        throw new BedroomTurnError(activeProposal.exitKind === "not_an_action"
          ? this.failureMessage(rawTtd, "这不像是一个要尝试执行的动作。", "This does not look like an action to try.")
          : this.failureMessage(rawTtd, "这个动作还不在当前世界支持的范围内。", "This action is outside the current world's supported scope."));
      }
      return this.executeActiveProposal(rawTtd, rootTurnId, activeProposal);
    }
    if (steps.length <= 1) return this.executeAudited(rawTtd, rootTurnId, 0, 1);

    const completed: TurnResult[] = [];
    for (const [stepIndex, step] of steps.entries()) {
      try {
        completed.push(await this.executeAudited(step, rootTurnId, stepIndex, steps.length));
      } catch (error) {
        if (completed.length === 0) throw error;
        const chinese = /[\u3400-\u9fff]/u.test(rawTtd);
        const failure = chinese
          ? `前面的动作已经发生，但“${step}”未能完成。`
          : `The earlier actions occurred, but “${step}” could not be completed.`;
        const last = completed.at(-1)!;
        return {
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
      response: completed.map((result) => result.response).join(""),
      commitPackage: last.commitPackage,
      commitPackages: completed.flatMap((result) => result.commitPackages ?? [result.commitPackage]),
      intent: parseMvpIntent(rawTtd),
      partial: false,
    };
  }

  private failureMessage(rawTtd: string, zh: string, en: string): string {
    return /[\u3400-\u9fff]/u.test(rawTtd) ? zh : en;
  }

  private async runActionIr(rawTtd: string, rootTurnId: string): Promise<ActionProposalEnvelopeV07 | null> {
    const config = this.options.actionIr;
    if (!config || config.mode === "off" || !config.proposer) return null;
    const auditId = `${rootTurnId}:action-ir`;
    const inputHash = createHash("sha256").update(rawTtd).digest("hex");
    try {
      const result = await config.proposer.propose(rawTtd);
      let groundingIssues: unknown[] = [];
      let semanticIssues: unknown[] = [];
      if (result.validation.proposal) {
        if (config.semanticAuditor) {
          const semantic = await config.semanticAuditor.review(rawTtd, result.validation.proposal);
          semanticIssues = semantic.violations;
        }
        const fixture = createObjectWorldFixture();
        const world = MaterializedWorld.replay(await this.options.store.list(), fixture.seedCommitments);
        groundingIssues = groundActionProposal(result.validation.proposal, fixture, world).issues;
      }
      await this.options.store.appendActionProposalAudit({
        auditId, rootTurnId, mode: config.mode, inputHash, outputHash: result.outputHash,
        status: result.validation.valid && groundingIssues.length === 0 && semanticIssues.length === 0 ? "validated" : "rejected",
        proposal: result.validation.proposal ?? undefined,
        validationIssues: result.validation.issues, groundingIssues, semanticIssues,
        model: result.model, latencyMs: result.latencyMs, usage: result.usage,
        createdAt: new Date().toISOString(),
      });
      if (!result.validation.valid || groundingIssues.length > 0 || semanticIssues.length > 0) return null;
      return result.validation.proposal;
    } catch {
      try {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: config.mode, inputHash, status: "model_error",
          validationIssues: [], groundingIssues: [], createdAt: new Date().toISOString(),
        });
      } catch { /* Shadow telemetry cannot affect execution. */ }
      return null;
    }
  }

  private async executeActiveProposal(rawTtd: string, rootTurnId: string, proposal: ActionProposalEnvelopeV07): Promise<TurnResult> {
    const completed: TurnResult[] = [];
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
        completed.push(await this.executeAudited(rawTtd, rootTurnId, stepIndex, proposal.steps.length, compiled.intent, compiled.mentionedEntityIds));
      } catch (error) {
        if (completed.length === 0) throw error;
        return this.partialResult(rawTtd, completed, step);
      }
    }
    const last = completed.at(-1)!;
    return { response: completed.map((item) => item.response).join(""), commitPackage: last.commitPackage,
      commitPackages: completed.flatMap((item) => item.commitPackages ?? [item.commitPackage]), intent: parseMvpIntent(rawTtd), partial: false };
  }

  private partialResult(rawTtd: string, completed: TurnResult[], step: ActionStepProposalV07): TurnResult {
    const last = completed.at(-1)!;
    const failure = this.failureMessage(rawTtd, `前面的动作已经发生，但“${step.primitive}”未能完成。`, `The earlier actions occurred, but “${step.primitive}” could not be completed.`);
    return { response: `${completed.map((item) => item.response).join("")} ${failure}`.trim(), commitPackage: last.commitPackage,
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
    await this.options.store.appendTurnAttempt({
      attemptId, rootTurnId, stepIndex, stepCount, rawTtd,
      status: "committed",
      commitSequence: result.commitPackage.commitSequence,
      selectedCandidateId: result.commitPackage.selectedCandidateId,
      createdAt: new Date().toISOString(),
    });
    return result;
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
