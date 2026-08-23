import type { JsonScalar } from "../world/commitmentTypes.js";
import type { SemanticAddress } from "../world/semanticAddress.js";

export type ObservationRecord =
  | { observationId: string; kind: "entity_presence"; observerId: string; entityIds: string[]; sourceOccurrenceId: string; provenance: "legacy" | "canonical" }
  | { observationId: string; kind: "attribute_perception"; observerId: string; semanticAddress: SemanticAddress; perceivedValue: JsonScalar; sourceOccurrenceId: string; provenance: "legacy" | "canonical" }
  | { observationId: string; kind: "relation_perception"; observerId: string; semanticAddress: SemanticAddress; perceivedValue: JsonScalar; sourceOccurrenceId: string; provenance: "legacy" | "canonical" }
  | RelationSetPerceptionObservation;

export type RelationSetPredicate = "contained_by" | "held_by";

export interface RelationSetScopeRef {
  kind: "relation_object";
  predicate: RelationSetPredicate;
  objectId: string;
}

/** A complete observation of every subject in one legally perceivable relation scope. */
export interface RelationSetPerceptionObservation {
  observationId: string;
  kind: "relation_set_perception";
  observerId: string;
  predicate: RelationSetPredicate;
  objectId: string;
  subjectIds: string[];
  completeness: "complete_for_scope";
  scopeRef: RelationSetScopeRef;
  sourceOccurrenceId: string;
  provenance: "canonical";
}

export function supportsScopedAbsence(
  observation: ObservationRecord,
): observation is RelationSetPerceptionObservation {
  return observation.kind === "relation_set_perception"
    && observation.subjectIds.length === 0
    && observation.completeness === "complete_for_scope"
    && observation.scopeRef.kind === "relation_object"
    && observation.scopeRef.predicate === observation.predicate
    && observation.scopeRef.objectId === observation.objectId;
}

export interface CanonicalEvidenceRecord {
  evidenceId: string;
  propositionAddress?: SemanticAddress;
  representedValue: JsonScalar | string[];
  sourceObservationId: string;
  provenance: "legacy" | "canonical";
}

export interface EpistemicAcquisition {
  acquisitionId: string;
  agentId: string;
  evidenceId: string;
  mode: "direct_perception";
  acquiredAtCommitSequence: number;
  provenance: "legacy" | "canonical";
}

export interface EpistemicEdge {
  agentId: string;
  propositionAddress?: SemanticAddress;
  representedValue: JsonScalar | string[];
  evidenceId: string;
  acquisitionId: string;
  acquiredAtCommitSequence: number;
}

export type ReplayIssueCode =
  | "NON_CONTIGUOUS_COMMIT_SEQUENCE"
  | "DUPLICATE_EVENT_ID"
  | "DUPLICATE_OBSERVATION_ID"
  | "DUPLICATE_EVIDENCE_ID"
  | "DUPLICATE_ACQUISITION_ID"
  | "MISSING_EVIDENCE_EVENT"
  | "MISSING_EVIDENCE_OBSERVATION"
  | "MISSING_ACQUISITION_EVIDENCE"
  | "MISSING_EPISTEMIC_AGENT"
  | "LEGACY_ADDRESS_UNCLASSIFIED"
  | "LEGACY_FIXED_VALUE_CONFLICT"
  | "UNSUPPORTED_LEGACY_EVIDENCE_KIND"
  | "INVALID_LEGACY_RECORD_SHAPE";

export interface ReplayIssue {
  code: ReplayIssueCode;
  path: string;
  message: string;
  fatal: boolean;
}
