import type { SemanticAddress } from "../world/semanticAddress.js";
import type { EvidenceLedgerView } from "./evidenceLedger.js";
import type { EpistemicAcquisition, EpistemicEdge, ReplayIssue } from "./types.js";

export interface AgentEpistemicGraphBuild {
  view: AgentEpistemicGraphView;
  issues: ReplayIssue[];
}

export class AgentEpistemicGraphView {
  private readonly edges: EpistemicEdge[];

  constructor(edges: readonly EpistemicEdge[]) {
    this.edges = edges.map((edge) => structuredClone(edge));
  }

  evidenceFor(agentId: string, propositionAddress: SemanticAddress): EpistemicEdge[] {
    return structuredClone(this.edges.filter((edge) => edge.agentId === agentId && edge.propositionAddress === propositionAddress));
  }

  allEdges(): EpistemicEdge[] {
    return structuredClone(this.edges);
  }
}

export function buildAgentEpistemicGraph(
  acquisitions: readonly EpistemicAcquisition[],
  evidenceLedger: EvidenceLedgerView,
  knownAgentIds: ReadonlySet<string>,
): AgentEpistemicGraphBuild {
  const issues: ReplayIssue[] = [];
  const acquisitionIds = new Set<string>();
  const edges: EpistemicEdge[] = [];
  for (const [index, acquisition] of acquisitions.entries()) {
    if (acquisitionIds.has(acquisition.acquisitionId)) {
      issues.push({ code: "DUPLICATE_ACQUISITION_ID", path: `acquisitions[${index}].acquisitionId`, message: `Acquisition ${acquisition.acquisitionId} is duplicated.`, fatal: true });
      continue;
    }
    acquisitionIds.add(acquisition.acquisitionId);
    const evidence = evidenceLedger.evidenceById(acquisition.evidenceId);
    if (!evidence) {
      issues.push({ code: "MISSING_ACQUISITION_EVIDENCE", path: `acquisitions[${index}].evidenceId`, message: `Acquisition references missing evidence ${acquisition.evidenceId}.`, fatal: true });
      continue;
    }
    if (!knownAgentIds.has(acquisition.agentId)) {
      issues.push({ code: "MISSING_EPISTEMIC_AGENT", path: `acquisitions[${index}].agentId`, message: `Acquisition references missing agent ${acquisition.agentId}.`, fatal: true });
      continue;
    }
    edges.push({
      agentId: acquisition.agentId,
      ...(evidence.propositionAddress ? { propositionAddress: evidence.propositionAddress } : {}),
      representedValue: structuredClone(evidence.representedValue),
      evidenceId: evidence.evidenceId,
      acquisitionId: acquisition.acquisitionId,
    });
  }
  return { view: new AgentEpistemicGraphView(edges), issues };
}
