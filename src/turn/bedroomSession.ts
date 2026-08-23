import type { BedroomFixture } from "../world/bedroomFixture.js";
import { createBedroomFixture } from "../world/bedroomFixture.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury, TurnRenderer, TurnResult } from "./bedroomTurn.js";
import { runBedroomTurn } from "./bedroomTurn.js";

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
    return runBedroomTurn({
      rawTtd,
      turnId: `${this.options.sessionId}:${commitSequence}`,
      commitSequence,
      fixture,
      jury: this.options.jury,
      renderer: this.options.renderer,
      store: this.options.store,
    });
  }
}
