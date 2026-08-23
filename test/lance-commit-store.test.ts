import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";

import {
  CommitConflictError,
  LanceCommitStore,
} from "../src/storage/lanceCommitStore.js";
import type { CommitPackage } from "../src/protocol/types.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

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
    stateChanges: [],
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

test("rejects a canonical envelope with presentation data that is not evidenced", async () => {
  await withStore(async (store) => {
    const fixture = createObjectWorldFixture();
    const input = commit("canonical-bad", 0);
    input.events[0]!.subjectRef = "self";
    const address = entityAttributeAddress("blank-note-1", "inscription");
    input.canonical = {
      schemaVersion: "1.0",
      observations: [{ observationId: "o", kind: "attribute_perception", observerId: "self", semanticAddress: address, perceivedValue: "", sourceOccurrenceId: "event-0", provenance: "canonical" }],
      evidence: [{ evidenceId: "e", propositionAddress: address, representedValue: "", sourceObservationId: "o", provenance: "canonical" }],
      acquisitions: [{ acquisitionId: "a", agentId: "self", evidenceId: "e", mode: "direct_perception", acquiredAtCommitSequence: 0, provenance: "canonical" }],
      presentationPacket: { packetId: "p", outcome: "answer", language: "en", items: [{ kind: "attribute_evidence", semanticAddress: address, value: "secret", evidenceId: "e" }] },
    };
    await assert.rejects(store.append(input, { seedCommitments: fixture.seedCommitments }), /PRESENTATION_EVIDENCE_MISMATCH/);
    assert.deepEqual(await store.list(), []);
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

test("repairs a missing success audit from an authoritative commit after restart", async () => {
  await withStore(async (store, uri) => {
    const input = commit("turn-0", 0);
    input.rootTurnId = "root-1";
    input.stepIndex = 0;
    input.stepCount = 1;
    input.attemptedTtd = "开门";
    await store.append(input);
    store.close();

    const reopened = new LanceCommitStore(uri);
    try {
      assert.deepEqual(await reopened.repairTurnAttempts(), { repaired: 1, existing: 0, skipped: 0 });
      assert.deepEqual(await reopened.repairTurnAttempts(), { repaired: 0, existing: 1, skipped: 0 });
      const [attempt] = await reopened.listTurnAttempts("root-1");
      assert.deepEqual({
        attemptId: attempt?.attemptId,
        rawTtd: attempt?.rawTtd,
        status: attempt?.status,
        commitSequence: attempt?.commitSequence,
      }, { attemptId: "root-1:0", rawTtd: "开门", status: "committed", commitSequence: 0 });
    } finally {
      reopened.close();
    }
  });
});

test("skips legacy commits that lack recovery metadata", async () => {
  await withStore(async (store) => {
    await store.append(commit("legacy", 0));
    assert.deepEqual(await store.repairTurnAttempts(), { repaired: 0, existing: 0, skipped: 1 });
    assert.deepEqual(await store.listTurnAttempts(), []);
  });
});

test("refuses to overwrite a failed audit that conflicts with a world commit", async () => {
  await withStore(async (store) => {
    const input = commit("turn-0", 0);
    input.rootTurnId = "root-1";
    input.stepIndex = 0;
    input.stepCount = 1;
    input.attemptedTtd = "开门";
    await store.append(input);
    await store.appendTurnAttempt({
      attemptId: "root-1:0", rootTurnId: "root-1", stepIndex: 0, stepCount: 1,
      rawTtd: "开门", status: "failed", failureCode: "ACTION_NOT_COMMITTED",
      createdAt: "2026-08-23T00:00:00.000Z",
    });
    await assert.rejects(store.repairTurnAttempts(), CommitConflictError);
  });
});

test("preflights schema and referential integrity before persistence", async () => {
  await withStore(async (store) => {
    const unknownType = commit("bad-type", 0);
    unknownType.stateChanges = [];
    unknownType.newWorldCommitments = [{ kind: "entity_created", entityId: "x", entityType: "alien" }];
    await assert.rejects(store.append(unknownType), /Unknown entity type/);

    const missingTarget = commit("bad-target", 0);
    missingTarget.stateChanges = [];
    missingTarget.newWorldCommitments = [
      { kind: "entity_created", entityId: "key-1", entityType: "key" },
      { kind: "relation_asserted", relationId: "r1", subjectId: "key-1", predicate: "located_on", objectId: "missing" },
    ];
    await assert.rejects(store.append(missingTarget), /missing object/);
    assert.deepEqual(await store.list(), []);
  });
});

test("requires state changes to be bridged to authoritative entity attributes", async () => {
  await withStore(async (store) => {
    const input = commit("unbridged", 0);
    input.stateChanges = [{ projection: "entity:self.position", to: "doorway", causedByEventId: "event-0" }];
    await assert.rejects(store.append(input), /matching attribute commitment/);
    assert.deepEqual(await store.list(), []);
  });
});

test("checks bridged state from-values against the authoritative entity", async () => {
  await withStore(async (store) => {
    const fixture = createObjectWorldFixture();
    const input = commit("wrong-from", 0);
    input.worldBasis = fixture.worldBasis;
    input.stateChanges = [{ projection: "entity:self.position", from: "elsewhere", to: "doorway", causedByEventId: "event-0" }];
    input.newWorldCommitments = [{ kind: "attribute_set", entityId: "self", attribute: "position", value: "doorway" }];
    await assert.rejects(store.append(input, { seedCommitments: fixture.seedCommitments }), /expected elsewhere, found bedside/);
  });
});

test("binds a declared world basis to the exact admitted seed", async () => {
  await withStore(async (store) => {
    const fixture = createObjectWorldFixture();
    const input = commit("wrong-seed", 0);
    input.worldBasis = fixture.worldBasis;
    await assert.rejects(store.append(input), /does not match the admitted seed/);
  });
});

test("rejects a candidate prepared against a stale world sequence", async () => {
  await withStore(async (store) => {
    const first = commit("turn-0", 0);
    first.expectedWorldCommitSequence = -1;
    await store.append(first);
    const stale = commit("turn-1", 1);
    stale.expectedWorldCommitSequence = -1;
    await assert.rejects(store.append(stale), /World changed after candidate preparation/);
    assert.equal((await store.list()).length, 1);
  });
});

test("allows only one of two stores to claim the same next world sequence", async () => {
  await withStore(async (store, uri) => {
    const contender = new LanceCommitStore(uri);
    try {
      const left = commit("left", 0);
      const right = commit("right", 0);
      left.expectedWorldCommitSequence = -1;
      right.expectedWorldCommitSequence = -1;
      const results = await Promise.allSettled([store.append(left), contender.append(right)]);
      assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
      assert.equal((await store.list()).length, 1);
    } finally {
      contender.close();
    }
  });
});

test("does not re-resolve an already fixed projection to another value", async () => {
  await withStore(async (store) => {
    const first = commit("turn-0", 0);
    first.resolvedProjections = [{ projection: "entity:self.hidden", value: "a", revision: 1 }];
    await store.append(first);
    const second = commit("turn-1", 1);
    second.resolvedProjections = [{ projection: "entity:self.hidden", value: "b", revision: 1 }];
    await assert.rejects(store.append(second), /already fixed to a/);
  });
});

test("serializes the same next sequence across separate processes", async () => {
  await withStore(async (store, uri) => {
    const worker = `
      import { LanceCommitStore } from ${JSON.stringify(new URL("../src/storage/lanceCommitStore.js", import.meta.url).href)};
      const [uri, turnId] = process.argv.slice(1);
      const store = new LanceCommitStore(uri);
      try {
        await store.append({ turnId, commitSequence: 0, expectedWorldCommitSequence: -1, selectedCandidateId: turnId,
          expectedProjectionRevisions: {}, resolvedProjections: [], events: [], stateChanges: [], observations: [], newWorldCommitments: [] });
      } finally { store.close(); }
    `;
    const run = (turnId: string) => new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", worker, uri, turnId], { stdio: "ignore" });
      child.on("exit", resolve);
    });
    const codes = await Promise.all([run("process-left"), run("process-right")]);
    assert.deepEqual(codes.sort(), [0, 1]);
    assert.equal((await store.list()).length, 1);
  });
});

test("replays canonical views read-only across restart", async () => {
  await withStore(async (store, uri) => {
    const fixture = createObjectWorldFixture();
    const input = commit("canonical-read", 0);
    input.worldBasis = fixture.worldBasis;
    input.events = [{ eventId: "read-event", type: "action_result", subjectRef: "self", objectRef: "blank-note-1" }];
    input.evidenceGenerated = [{ evidenceId: "read-evidence", kind: "attribute_observed", sourceEventId: "read-event", subjectId: "blank-note-1", attribute: "inscription", value: "" }];
    input.epistemicChanges = [{ agentId: "self", kind: "acquired_evidence", evidenceId: "read-evidence" }];
    await store.append(input, { seedCommitments: fixture.seedCommitments });
    const before = await store.list();
    const first = await store.replayCanonicalViews(fixture.seedCommitments);
    assert.equal(first.evidence.allEvidence().length, 1);
    assert.equal(first.epistemic.allEdges().length, 1);
    assert.deepEqual(await store.list(), before);
    store.close();

    const reopened = new LanceCommitStore(uri);
    try {
      const second = await reopened.replayCanonicalViews(fixture.seedCommitments);
      assert.deepEqual(second.evidence.allEvidence(), first.evidence.allEvidence());
      assert.deepEqual(second.epistemic.allEdges(), first.epistemic.allEdges());
      assert.deepEqual(await reopened.list(), before);
      const concurrent = await Promise.all(Array.from({ length: 4 }, () => reopened.replayCanonicalViews(fixture.seedCommitments)));
      assert.ok(concurrent.every((result) => result.issues.length === 0));
      assert.deepEqual(await reopened.list(), before);
    } finally {
      reopened.close();
    }
  });
});
