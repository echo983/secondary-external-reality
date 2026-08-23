import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CommitConflictError,
  LanceCommitStore,
} from "../src/storage/lanceCommitStore.js";
import type { CommitPackage } from "../src/protocol/types.js";

function commit(turnId: string, commitSequence: number): CommitPackage {
  return {
    turnId,
    commitSequence,
    selectedCandidateId: `candidate-${commitSequence}`,
    expectedProjectionRevisions: {
      "entity:self.position": commitSequence,
    },
    resolvedProjections: [],
    events: [
      {
        eventId: `event-${commitSequence}`,
        type: "action_result",
        actionKind: "move",
        outcome: "success",
      },
    ],
    stateChanges: [
      {
        projection: "entity:self.position",
        to: `position-${commitSequence}`,
        causedByEventId: `event-${commitSequence}`,
      },
    ],
    observations: [],
    newWorldCommitments: [],
  };
}

async function withStore(
  run: (store: LanceCommitStore, uri: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-lance-"));
  const uri = join(directory, "world.lancedb");
  const store = new LanceCommitStore(uri);
  try {
    await run(store, uri);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("appends and reads a complete commit package", async () => {
  await withStore(async (store) => {
    const input = commit("turn-0", 0);
    const result = await store.append(input);
    assert.equal(result.status, "appended");
    assert.equal(result.commitId, "turn-0:0");
    assert.match(result.packageHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(await store.list(), [input]);
  });
});

test("retries the same package idempotently", async () => {
  await withStore(async (store) => {
    const input = commit("turn-0", 0);
    const first = await store.append(input);
    const second = await store.append(input);
    assert.equal(first.status, "appended");
    assert.equal(second.status, "existing");
    assert.equal(second.packageHash, first.packageHash);
    assert.equal((await store.list()).length, 1);
  });
});

test("rejects conflicting content for an existing commit identity", async () => {
  await withStore(async (store) => {
    const input = commit("turn-0", 0);
    await store.append(input);
    const conflicting = structuredClone(input);
    conflicting.selectedCandidateId = "different";
    await assert.rejects(
      store.append(conflicting),
      CommitConflictError,
    );
  });
});

test("enforces contiguous global commit sequences", async () => {
  await withStore(async (store) => {
    await store.append(commit("turn-0", 0));
    await assert.rejects(store.append(commit("turn-2", 2)), CommitConflictError);
    await store.append(commit("turn-1", 1));
    assert.deepEqual(
      (await store.list()).map((entry) => entry.commitSequence),
      [0, 1],
    );
  });
});

test("serializes concurrent in-process appends", async () => {
  await withStore(async (store) => {
    const results = await Promise.all([
      store.append(commit("turn-0", 0)),
      store.append(commit("turn-1", 1)),
    ]);
    assert.deepEqual(results.map((entry) => entry.status), ["appended", "appended"]);
    assert.equal((await store.list()).length, 2);
  });
});

test("reopens the append log without losing committed packages", async () => {
  await withStore(async (store, uri) => {
    const input = commit("turn-0", 0);
    await store.append(input);
    store.close();

    const reopened = new LanceCommitStore(uri);
    try {
      assert.deepEqual(await reopened.list(), [input]);
      const retry = await reopened.append(input);
      assert.equal(retry.status, "existing");
    } finally {
      reopened.close();
    }
  });
});

test("reopens and filters non-authoritative turn attempts", async () => {
  await withStore(async (store, uri) => {
    const attempt = {
      attemptId: "root-1:0", rootTurnId: "root-1", stepIndex: 0, stepCount: 1,
      rawTtd: "开门", status: "failed" as const, failureCode: "ACTION_NOT_COMMITTED",
      createdAt: "2026-08-23T00:00:00.000Z",
    };
    await store.appendTurnAttempt(attempt);
    await store.appendTurnAttempt(attempt);
    store.close();
    const reopened = new LanceCommitStore(uri);
    try {
      assert.deepEqual(await reopened.listTurnAttempts("root-1"), [attempt]);
      assert.deepEqual(await reopened.listTurnAttempts("missing"), []);
    } finally {
      reopened.close();
    }
  });
});
