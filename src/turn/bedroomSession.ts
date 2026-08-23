import { randomUUID } from "node:crypto";

import type { BedroomFixture } from "../world/bedroomFixture.js";
import { createBedroomFixture } from "../world/bedroomFixture.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury, TurnRenderer, TurnResult } from "./bedroomTurn.js";
import { runBedroomTurn } from "./bedroomTurn.js";
import { isObjectIntent, runObjectTurn } from "./objectTurn.js";
import { parseMvpIntent } from "../world/intent.js";
import { parseObjectIntent, splitActionSequence } from "../world/objectIntent.js";

export interface BedroomSessionOptions {
  sessionId: string;
  store: LanceCommitStore;
  jury: BedroomJury;
  renderer: TurnRenderer;
  fixtureFactory?: () => BedroomFixture;
}

export class BedroomSession {
  private tail: Promise<void> = Promise.resolve();

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
    const wholeObjectIntent = parseObjectIntent(rawTtd);
    const atomicComposite = wholeObjectIntent?.operation === "write_and_hide" || wholeObjectIntent?.operation === "open_and_observe" || wholeObjectIntent?.operation === "read";
    const steps = atomicComposite ? [rawTtd.trim()] : splitActionSequence(rawTtd);
    const rootTurnId = `${this.options.sessionId}:${randomUUID()}`;
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
        rootTurnId, stepIndex, stepCount,
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
        rootTurnId, stepIndex, stepCount,
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
      rootTurnId, stepIndex, stepCount,
    });
  }
}
