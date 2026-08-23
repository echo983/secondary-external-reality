import assert from "node:assert/strict";
import test from "node:test";

import { AgentEpistemicGraphView } from "../src/epistemic/agentGraph.js";
import { triageFixedQuery } from "../src/query/queryTriage.js";
import type { CommitPackage } from "../src/protocol/types.js";
import { MaterializedWorld } from "../src/world/materializedWorld.js";
import { createObjectWorldFixture } from "../src/world/objectFixture.js";
import { entityAttributeAddress } from "../src/world/semanticAddress.js";

const fixture = createObjectWorldFixture();
const base = MaterializedWorld.replay([], fixture.seedCommitments);
const request = { queryId: "q", agentId: "self", kind: "locate" as const, targetEntityId: "blank-note-1", language: "en" as const };

test("triages visibility and closed-container boundaries without returning fact values", () => {
  assert.equal(triageFixedQuery(request, base, new AgentEpistemicGraphView([])).kind, "perceive_fixed_now");
  const hide: CommitPackage = { turnId: "hide", commitSequence: 0, selectedCandidateId: "hide", expectedProjectionRevisions: {}, resolvedProjections: [], events: [], stateChanges: [], observations: [], evidenceGenerated: [], epistemicChanges: [], newWorldCommitments: [
    { kind: "relation_ended", relationId: "seed-note-location" },
    { kind: "relation_asserted", relationId: "hidden", subjectId: "blank-note-1", predicate: "contained_by", objectId: "drawer-1" },
  ] };
  const hidden = MaterializedWorld.replay([hide], fixture.seedCommitments);
  assert.deepEqual(triageFixedQuery(request, hidden, new AgentEpistemicGraphView([])), { kind: "epistemic_boundary", request, code: "TARGET_NOT_PERCEIVABLE" });
  const contents = { ...request, kind: "inspect_contents" as const, targetEntityId: "drawer-1" };
  assert.deepEqual(triageFixedQuery(contents, hidden, new AgentEpistemicGraphView([])), { kind: "epistemic_boundary", request: contents, code: "CONTAINER_CLOSED" });
});

test("consults only evidence acquired by the requesting agent and chooses the latest", () => {
  const address = entityAttributeAddress("blank-note-1", "inscription");
  const consultation = { queryId: "q2", agentId: "self", kind: "consult_acquired_evidence" as const, propositionAddress: address, language: "en" as const };
  const graph = new AgentEpistemicGraphView([
    { agentId: "self", propositionAddress: address, representedValue: "old", evidenceId: "e1", acquisitionId: "a1", acquiredAtCommitSequence: 2 },
    { agentId: "self", propositionAddress: address, representedValue: "new", evidenceId: "e2", acquisitionId: "a2", acquiredAtCommitSequence: 8 },
  ]);
  assert.deepEqual(triageFixedQuery(consultation, base, graph), { kind: "consult_acquired_evidence", request: consultation, evidenceId: "e2", acquiredAtCommitSequence: 8 });
  assert.equal(triageFixedQuery({ ...consultation, agentId: "other" }, base, graph).kind, "epistemic_boundary");
});
