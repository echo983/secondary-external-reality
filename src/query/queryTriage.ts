import type { AgentEpistemicGraphView } from "../epistemic/agentGraph.js";
import type { MaterializedWorld } from "../world/materializedWorld.js";
import { isEntityPerceivable, mayInspectContents } from "./perceptionPolicy.js";
import type { QueryDecision, QueryRequest } from "./types.js";

export function triageFixedQuery(request: QueryRequest, world: MaterializedWorld, epistemic: AgentEpistemicGraphView): QueryDecision {
  if (request.kind === "consult_acquired_evidence") {
    if (!request.propositionAddress) return { kind: "unsupported_boundary", request, code: "UNSUPPORTED_PROJECTION" };
    const latest = epistemic.evidenceFor(request.agentId, request.propositionAddress)
      .sort((left, right) => right.acquiredAtCommitSequence - left.acquiredAtCommitSequence)[0];
    return latest
      ? { kind: "consult_acquired_evidence", request, evidenceId: latest.evidenceId, acquiredAtCommitSequence: latest.acquiredAtCommitSequence }
      : { kind: "epistemic_boundary", request, code: "NO_ACQUIRED_EVIDENCE" };
  }
  if (request.kind === "look_around" || request.kind === "inventory") return { kind: "perceive_fixed_now", request };
  if (!request.targetEntityId) return { kind: "unsupported_boundary", request, code: "AMBIGUOUS_TARGET" };
  const target = world.entities.get(request.targetEntityId);
  if (!target) return { kind: "unsupported_boundary", request, code: "AMBIGUOUS_TARGET" };
  if (request.kind === "inspect_contents") {
    const path = mayInspectContents(world, target);
    return path.allowed ? { kind: "perceive_fixed_now", request } : { kind: "epistemic_boundary", request, code: path.code };
  }
  if (isEntityPerceivable(world, target)) return { kind: "perceive_fixed_now", request };
  if (request.propositionAddress) {
    const latest = epistemic.evidenceFor(request.agentId, request.propositionAddress).sort((left, right) => right.acquiredAtCommitSequence - left.acquiredAtCommitSequence)[0];
    if (latest) return { kind: "consult_acquired_evidence", request, evidenceId: latest.evidenceId, acquiredAtCommitSequence: latest.acquiredAtCommitSequence };
  }
  return { kind: "epistemic_boundary", request, code: "TARGET_NOT_PERCEIVABLE" };
}
