import type { CommitPackage, WorldCommitment } from "../protocol/types.js";
import { buildAgentEpistemicGraph, type AgentEpistemicGraphView } from "../epistemic/agentGraph.js";
import { buildEvidenceLedger, type EvidenceLedgerView } from "../epistemic/evidenceLedger.js";
import type { ReplayIssue } from "../epistemic/types.js";
import { buildCommitmentGraph, type CommitmentGraphView } from "../world/commitmentGraph.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { adaptLegacyCommits } from "./legacyCanonicalAdapter.js";

export type CanonicalReplayMode = "strict" | "diagnostic";

export interface CanonicalReplayOptions {
  seedCommitments: readonly WorldCommitment[];
  mode?: CanonicalReplayMode;
}

export interface CanonicalReplayViews {
  commitments: CommitmentGraphView;
  evidence: EvidenceLedgerView;
  epistemic: AgentEpistemicGraphView;
  issues: ReplayIssue[];
}

export class CanonicalReplayError extends Error {
  constructor(readonly issues: readonly ReplayIssue[]) {
    super(`Canonical replay found ${issues.filter((entry) => entry.fatal).length} fatal issue(s).`);
    this.name = "CanonicalReplayError";
  }
}

export function replayCanonicalViews(
  commits: readonly CommitPackage[],
  options: CanonicalReplayOptions,
): CanonicalReplayViews {
  const materialized = MaterializedWorld.replay(commits, options.seedCommitments);
  const adapted = adaptLegacyCommits(commits, { seedCommitments: options.seedCommitments });
  const commitments = buildCommitmentGraph(adapted.legacyFixedProjections);
  const evidence = buildEvidenceLedger(adapted.observations, adapted.evidence);
  const epistemicAgentIds = new Set(
    [...materialized.entities.values()]
      .filter((entity) => entity.entityType === "person")
      .map((entity) => entity.entityId),
  );
  const epistemic = buildAgentEpistemicGraph(adapted.acquisitions, evidence.view, epistemicAgentIds);
  const issues = structuredClone([
    ...adapted.issues,
    ...commitments.issues,
    ...evidence.issues,
    ...epistemic.issues,
  ]);
  if ((options.mode ?? "strict") === "strict" && issues.some((entry) => entry.fatal)) {
    throw new CanonicalReplayError(issues);
  }
  return { commitments: commitments.view, evidence: evidence.view, epistemic: epistemic.view, issues };
}
