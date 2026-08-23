import { randomUUID } from "node:crypto";

import type { BedroomFixture } from "../world/bedroomFixture.js";
import { createBedroomFixture } from "../world/bedroomFixture.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury, TurnRenderer, TurnResult } from "./bedroomTurn.js";
import { runBedroomTurn } from "./bedroomTurn.js";
import { isObjectIntent, runObjectTurn } from "./objectTurn.js";
import { parseMvpIntent } from "../world/intent.js";
import { parseObjectIntent, splitActionSequence } from "../world/objectIntent.js";
import type { ActionIrProposer } from "../actionIr/proposer.js";
import { createHash } from "node:crypto";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { groundActionProposal } from "../actionIr/grounding.js";
import type { ActionIrSemanticAuditor } from "../actionIr/semanticAuditor.js";

export interface BedroomSessionOptions {
  sessionId: string;
  store: LanceCommitStore;
  jury: BedroomJury;
  renderer: TurnRenderer;
  fixtureFactory?: () => BedroomFixture;
  actionIr?: { mode: "off" | "shadow"; proposer?: ActionIrProposer; semanticAuditor?: ActionIrSemanticAuditor };
}

export class BedroomSession {
  private tail: Promise<void> = Promise.resolve();
  private auditRepair: Promise<unknown> | null = null;

  constructor(private readonly options: BedroomSessionOptions) {
    if (!options.sessionId.trim()) throw new Error("Session ID must be non-empty.");
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
    await this.runActionIrShadow(rawTtd, rootTurnId);
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

  private async runActionIrShadow(rawTtd: string, rootTurnId: string): Promise<void> {
    const config = this.options.actionIr;
    if (config?.mode !== "shadow" || !config.proposer) return;
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
        auditId, rootTurnId, mode: "shadow", inputHash, outputHash: result.outputHash,
        status: result.validation.valid && groundingIssues.length === 0 && semanticIssues.length === 0 ? "validated" : "rejected",
        proposal: result.validation.proposal ?? undefined,
        validationIssues: result.validation.issues, groundingIssues, semanticIssues,
        model: result.model, latencyMs: result.latencyMs, usage: result.usage,
        createdAt: new Date().toISOString(),
      });
    } catch {
      try {
        await this.options.store.appendActionProposalAudit({
          auditId, rootTurnId, mode: "shadow", inputHash, status: "model_error",
          validationIssues: [], groundingIssues: [], createdAt: new Date().toISOString(),
        });
      } catch { /* Shadow telemetry cannot affect execution. */ }
    }
  }

  private async executeAudited(rawTtd: string, rootTurnId: string, stepIndex: number, stepCount: number): Promise<TurnResult> {
    const attemptId = `${rootTurnId}:${stepIndex}`;
    let result: TurnResult;
    try {
      result = await this.executeSingle(rawTtd, rootTurnId, stepIndex, stepCount);
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

  private async executeSingle(rawTtd: string, rootTurnId: string, stepIndex: number, stepCount: number): Promise<TurnResult> {
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
    if (isObjectIntent(rawTtd)) {
      return runObjectTurn({
        rawTtd,
        turnId: `${this.options.sessionId}:${commitSequence}`,
        commitSequence,
        priorCommits: commits,
        jury: this.options.jury,
        store: this.options.store,
        rootTurnId, stepIndex, stepCount, attemptedTtd: rawTtd,
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
