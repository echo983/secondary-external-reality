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

export interface ConditionalCandidate {
  candidateId: string;
  outcomeKind: OutcomeKind;
  requiresResolution: ResolutionRequirement[];
  conditions: CandidateCondition[];
  proposedEvents: ProposedEvent[];
  proposedStateChanges: StateChange[];
  observations: unknown[];
  newWorldCommitments: unknown[];
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
