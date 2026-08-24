import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CommitPackage } from "../src/protocol/types.js";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { checkCommitmentClosureTemplates, checkIntensionalCommitmentFidelity, checkReplayDeterminism } from "../src/verification/acceptanceChecks.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";
import { resolvePlaceNotableFeature } from "../src/turn/objectTurn.js";
import { HALLWAY_NOTABLE_FEATURES } from "../src/world/worldSchema.js";

function session(store: LanceCommitStore): BedroomSession {
  return new BedroomSession({ sessionId: "acceptance", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
}

test("closure templates accept every real commit produced by a varied action sequence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-acceptance-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("看看周围");
    await current.submit("我在哪里");
    await current.submit("走到门口");
    await current.submit("走到床边");
    await current.submit("打开抽屉");
    await current.submit("拿起钥匙");
    await current.submit("把钥匙放进抽屉");
    await current.submit("拿出钥匙");
    await current.submit("拿起笔");
    await current.submit("我向空白纸条写下2236，然后把纸条放到枕头下面");
    await current.submit("我翻开枕头看看下面，并读纸条");
    await current.submit("关上抽屉");
    await current.submit("打开门");
    await current.submit("走到走廊");
    await current.submit("环顾四周");
    await current.submit("环顾四周");

    const commits = await store.list();
    const closureIssues = checkCommitmentClosureTemplates(commits);
    assert.deepEqual(closureIssues, []);

    const fixture = createObjectWorldFixture();
    const replayIssues = checkReplayDeterminism(commits, fixture.seedCommitments);
    assert.deepEqual(replayIssues, []);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closure templates reject a commit with only half of a relocation pair", () => {
  const dangling: CommitPackage = {
    turnId: "synthetic:0", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "take", outcome: "success", subjectRef: "self", objectRef: "key-1" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [{ kind: "relation_ended", relationId: "seed-key-location" }],
  };
  const issues = checkCommitmentClosureTemplates([dangling]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "CLOSURE_TEMPLATE_VIOLATION");
});

test("closure templates reject a move commit that also touches an unrelated attribute", () => {
  const overCommitted: CommitPackage = {
    turnId: "synthetic:1", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "move", outcome: "success", subjectRef: "self", objectRef: "door-1" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [
      { kind: "attribute_set", entityId: "self", attribute: "position", value: "doorway" },
      { kind: "attribute_set", entityId: "self", attribute: "posture", value: "standing" },
    ],
  };
  const issues = checkCommitmentClosureTemplates([overCommitted]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "CLOSURE_TEMPLATE_VIOLATION");
});

test("closure templates reject a look_around that resolves more than the one Free hallway projection", () => {
  const overResolved: CommitPackage = {
    turnId: "synthetic:hallway", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "look_around", outcome: "success", subjectRef: "self", objectRef: "hallway-1" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [
      { kind: "attribute_set", entityId: "hallway-1", attribute: "notable_feature", value: "wall_lamp" },
      { kind: "attribute_set", entityId: "hallway-1", attribute: "zh_name", value: "走廊" },
    ],
  };
  const issues = checkCommitmentClosureTemplates([overResolved]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "CLOSURE_TEMPLATE_VIOLATION");
});

test("closure templates flag an unrecognized actionKind combination instead of silently passing it", () => {
  const unknownShape: CommitPackage = {
    turnId: "synthetic:2", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "teleport", outcome: "success", subjectRef: "self" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [{ kind: "attribute_set", entityId: "self", attribute: "position", value: "doorway" }],
  };
  const issues = checkCommitmentClosureTemplates([unknownShape]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "UNKNOWN_CLOSURE_TEMPLATE");
  assert.equal(issues[0]?.severity, "warn");
});

test("intensional commitment fidelity accepts a real hallway/living-room resolution regenerated from the committed seed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-intensional-"));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  try {
    const current = session(store);
    await current.submit("打开门");
    await current.submit("走到走廊");
    await current.submit("环顾四周");
    await current.submit("走到客厅");
    await current.submit("环顾四周");

    const commits = await store.list();
    const fixture = createObjectWorldFixture();
    const issues = checkIntensionalCommitmentFidelity(commits, fixture.worldBasis);
    assert.deepEqual(issues, []);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("intensional commitment fidelity rejects a notable_feature value that does not regenerate from its own committed seed", () => {
  const fixture = createObjectWorldFixture();
  const trueValue = resolvePlaceNotableFeature("hallway-1", fixture.worldBasis.seedHash, HALLWAY_NOTABLE_FEATURES);
  const wrongValue = HALLWAY_NOTABLE_FEATURES.find((candidate) => candidate !== trueValue)!;
  const tampered: CommitPackage = {
    turnId: "synthetic:hallway-drift", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "look_around", outcome: "success", subjectRef: "self", objectRef: "hallway-1" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [{ kind: "attribute_set", entityId: "hallway-1", attribute: "notable_feature", value: wrongValue }],
  };
  const issues = checkIntensionalCommitmentFidelity([tampered], fixture.worldBasis);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "INTENSIONAL_REGENERATION_MISMATCH");
  assert.equal(issues[0]?.severity, "fatal");
});

test("replay determinism detects a world that mutates on replay", () => {
  const fixture = createObjectWorldFixture();
  const commits: CommitPackage[] = [{
    turnId: "synthetic:0", commitSequence: 0, selectedCandidateId: "synthetic",
    expectedProjectionRevisions: {}, resolvedProjections: [],
    events: [{ eventId: "e-1", type: "action_result", actionKind: "open", outcome: "success", subjectRef: "self", objectRef: "drawer-1" }],
    stateChanges: [], observations: [],
    newWorldCommitments: [{ kind: "attribute_set", entityId: "drawer-1", attribute: "open_state", value: "open" }],
  }];
  const issues = checkReplayDeterminism(commits, fixture.seedCommitments);
  assert.deepEqual(issues, []);
});
