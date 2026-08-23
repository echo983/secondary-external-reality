import type { ApprovedPresentationPacket, PublicBoundaryCode } from "../presentation/types.js";
import type { SemanticAddress } from "../world/semanticAddress.js";

export type FixedQueryKind =
  | "look_around"
  | "inventory"
  | "inspect_contents"
  | "locate"
  | "inspect_attribute"
  | "inspect_relation"
  | "consult_acquired_evidence";

export interface QueryRequest {
  queryId: string;
  agentId: string;
  kind: FixedQueryKind;
  targetEntityId?: string;
  propositionAddress?: SemanticAddress;
  language: "zh" | "en";
}

export type QueryDecision =
  | { kind: "perceive_fixed_now"; request: QueryRequest }
  | { kind: "consult_acquired_evidence"; request: QueryRequest; evidenceId: string; acquiredAtCommitSequence: number }
  | { kind: "epistemic_boundary"; request: QueryRequest; code: Extract<PublicBoundaryCode, "TARGET_NOT_PERCEIVABLE" | "CONTAINER_CLOSED" | "NO_ACQUIRED_EVIDENCE"> }
  | { kind: "unsupported_boundary"; request: QueryRequest; code: Extract<PublicBoundaryCode, "UNSUPPORTED_PROJECTION" | "AMBIGUOUS_TARGET"> }
  | { kind: "resolution_deferred"; request: QueryRequest; code: "RESOLUTION_DEFERRED" };

export type QueryOutcome =
  | { kind: "approved_answer"; packet: ApprovedPresentationPacket; acquisitionRequired: boolean }
  | { kind: "approved_boundary"; packet: ApprovedPresentationPacket; acquisitionRequired: false };
