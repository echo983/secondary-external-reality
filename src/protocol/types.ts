export const OUTCOME_KINDS = [
  "success",
  "partial",
  "failure",
  "boundary",
] as const;

export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const EVENT_TYPES = [
  "action_attempt",
  "action_result",
  "utterance",
  "social_response",
  "observation",
  "epistemic_acquisition",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type ProjectionState = "known" | "unknown" | "unsupported";

export interface ProjectionDefinition {
  address: string;
  state: ProjectionState;
  allowedValues: readonly string[];
  value?: string;
}

export interface ResolutionRequirement {
  projection: string;
  reason: string;
}

export interface CandidateCondition {
  projection: string;
  operator: "eq";
  value: string;
}

export interface ProposedEvent {
  eventId: string;
  type: EventType;
  actionKind?: string;
  outcome?: "success" | "partial" | "failure";
  subjectRef?: string;
  objectRef?: string;
  responseKind?: string;
}

export interface StateChange {
  projection: string;
  from?: string;
  to: string;
  causedByEventId: string;
}

export interface EntityCreatedCommitment {
  kind: "entity_created";
  entityId: string;
  entityType: string;
}

export interface AttributeSetCommitment {
  kind: "attribute_set";
  entityId: string;
  attribute: string;
  value: string;
}

export interface RelationSetCommitment {
  kind: "relation_set";
  subjectId: string;
  predicate: string;
  objectId: string;
}

export interface RelationAssertedCommitment {
  kind: "relation_asserted";
  relationId: string;
  subjectId: string;
  predicate: string;
  objectId: string;
}

export interface RelationEndedCommitment {
  kind: "relation_ended";
  relationId: string;
}

export type WorldCommitment =
  | EntityCreatedCommitment
  | AttributeSetCommitment
  | RelationSetCommitment
  | RelationAssertedCommitment
  | RelationEndedCommitment;

export interface EvidenceRecord {
  evidenceId: string;
  kind: "entity_observed" | "attribute_observed" | "relation_observed";
  sourceEventId: string;
  subjectId: string;
  predicate?: string;
  objectId?: string;
  attribute?: string;
  value?: string;
}

export interface EpistemicChange {
  agentId: string;
  kind: "acquired_evidence";
  evidenceId: string;
}

export interface ConditionalCandidate {
  candidateId: string;
  outcomeKind: OutcomeKind;
  requiresResolution: ResolutionRequirement[];
  conditions: CandidateCondition[];
  proposedEvents: ProposedEvent[];
  proposedStateChanges: StateChange[];
  observations: unknown[];
  evidenceGenerated?: EvidenceRecord[];
  epistemicChanges?: EpistemicChange[];
  newWorldCommitments: WorldCommitment[];
}

export interface CandidateEnvelope {
  candidates: ConditionalCandidate[];
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ProjectionSnapshot {
  projection: string;
  value: string;
  revision: number;
}

export type CandidateEligibility = "eligible" | "ineligible" | "unresolved";

export interface ConditionEvaluation {
  projection: string;
  expectedValue: string;
  actualValue?: string;
  matched: boolean | null;
}

export interface CandidateEvaluation {
  candidateId: string;
  status: CandidateEligibility;
  conditions: ConditionEvaluation[];
  unresolvedProjections: string[];
}

export interface EnvelopeEvaluation {
  valid: boolean;
  issues: ValidationIssue[];
  candidates: CandidateEvaluation[];
  eligibleCandidateIds: string[];
}

export interface JuryBatch {
  projectionRevisions: Record<string, number>;
  candidates: ConditionalCandidate[];
}

export interface JuryReport {
  candidateId: string;
  verdict: "pass" | "fail";
  violations: ValidationIssue[];
}

export interface CommitmentCostVector {
  newWorldCommitments: number;
  stateChanges: number;
  events: number;
  observations: number;
  resolvedProjections: number;
}

export interface CandidateSelectionEntry {
  candidateId: string;
  cost: CommitmentCostVector;
  dominatedBy: string[];
}

export type SelectionStatus = "selected" | "ambiguous" | "none";

export interface CandidateSelection {
  status: SelectionStatus;
  selectedCandidateId: string | null;
  nonDominatedCandidateIds: string[];
  entries: CandidateSelectionEntry[];
}

export interface CommitPackage {
  turnId: string;
  commitSequence: number;
  selectedCandidateId: string;
  expectedProjectionRevisions: Record<string, number>;
  resolvedProjections: ProjectionSnapshot[];
  events: ProposedEvent[];
  stateChanges: StateChange[];
  observations: unknown[];
  evidenceGenerated?: EvidenceRecord[];
  epistemicChanges?: EpistemicChange[];
  newWorldCommitments: WorldCommitment[];
}

export interface CommitPreparationResult {
  ready: boolean;
  issues: ValidationIssue[];
  commitPackage: CommitPackage | null;
}
