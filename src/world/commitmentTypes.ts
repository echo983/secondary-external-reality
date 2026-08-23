import type { SemanticAddress } from "./semanticAddress.js";

export type JsonScalar = string | number | boolean | null;
export type ProjectionSupport = "unsupported" | "supported";

export interface ProjectionSpecification {
  semanticAddress: SemanticAddress;
  support: ProjectionSupport;
  valueSchemaId: string;
  realizationOperatorId?: string;
  dependencyAddresses: SemanticAddress[];
}

export interface ProjectionCommitment {
  semanticAddress: SemanticAddress;
  value: JsonScalar;
  determination: "counterfactually_fixed";
  roots: Array<"seed" | "mu" | "struct">;
  dependencyAddresses: SemanticAddress[];
  origin:
    | { kind: "realized"; operatorId: string; operatorVersion: string; realizationInputHash: string }
    | { kind: "authored"; basisRef: string };
  fixedAtCommitSequence: number;
}

export interface CommitmentProvenanceRecord {
  semanticAddress: SemanticAddress;
  root: "struct" | "exp";
  sourceRef: string;
  recordedAt: string;
}

export type LegacyProjectionClassification =
  | "immutable_candidate"
  | "mutable_state_snapshot"
  | "action_resolution"
  | "unclassified";

export interface LegacyFixedProjection {
  sourceAddress: string;
  canonicalAddress?: SemanticAddress;
  value: JsonScalar;
  fixedAtCommitSequence: number;
  classification: LegacyProjectionClassification;
  provenance: "legacy_fixed";
}
