import type { RelationSetPredicate } from "../epistemic/types.js";
import type { JsonScalar } from "../world/commitmentTypes.js";
import type { SemanticAddress } from "../world/semanticAddress.js";

export type PublicBoundaryCode =
  | "TARGET_NOT_PERCEIVABLE"
  | "CONTAINER_CLOSED"
  | "NO_ACQUIRED_EVIDENCE"
  | "UNSUPPORTED_PROJECTION"
  | "RESOLUTION_DEFERRED"
  | "AMBIGUOUS_TARGET"
  | "RECOLLECTION_FADED";

export type ApprovedEvidenceItem =
  | { kind: "attribute_evidence"; semanticAddress: SemanticAddress; value: JsonScalar; evidenceId: string }
  | { kind: "relation_evidence"; semanticAddress: SemanticAddress; value: JsonScalar; evidenceId: string };

export type ApprovedPresentationItem =
  | { kind: "observed_entities"; entityIds: string[] }
  | { kind: "bounded_relation_set"; predicate: RelationSetPredicate; objectId: string; subjectIds: string[]; complete: true }
  | ApprovedEvidenceItem
  | { kind: "prior_evidence"; evidence: ApprovedEvidenceItem; acquiredAtCommitSequence: number }
  | { kind: "recollection"; evidence: ApprovedEvidenceItem; acquiredAtCommitSequence: number }
  | { kind: "boundary"; code: PublicBoundaryCode };

export interface ApprovedPresentationPacket {
  packetId: string;
  outcome: "answer" | "boundary";
  language: "zh" | "en";
  items: ApprovedPresentationItem[];
}
