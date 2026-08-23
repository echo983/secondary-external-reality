import type { CommitPackage, JuryBatch, JuryReport } from "../protocol/types.js";
import type { NormalizedIntent } from "../world/intent.js";
import type { ApprovedPresentationPacket } from "../presentation/types.js";

export interface BedroomJury { review(batch: JuryBatch): Promise<JuryReport[]> }
export interface TurnRenderer { render(commitPackage: CommitPackage, intent: NormalizedIntent): Promise<string> }
export interface CommittedTurnResult {
  kind: "committed";
  response: string;
  commitPackage: CommitPackage;
  intent: NormalizedIntent;
  commitPackages?: CommitPackage[];
  partial?: boolean;
}
export interface BoundaryTurnResult {
  kind: "boundary";
  response: string;
  packet: ApprovedPresentationPacket;
  intent: NormalizedIntent;
  commitPackage: never;
  commitPackages?: never;
  partial?: false;
}
export interface EvidenceTurnResult {
  kind: "evidence";
  response: string;
  packet: ApprovedPresentationPacket;
  intent: NormalizedIntent;
  commitPackage: never;
  commitPackages?: never;
  partial?: false;
}
export interface InterfaceTurnResult {
  kind: "interface";
  response: string;
  code: "CONVERSATION" | "INCOMPLETE_FRAGMENT" | "UNSUPPORTED_WORLD_SCOPE" | "UNSUPPORTED_CAPABILITY" | "UNSUPPORTED_MODIFIER" | "AMBIGUOUS_REFERENCE" |
    "INTERACTION_CAPABILITY_QUERY" | "INTERACTION_NON_ACTUAL" | "INTERACTION_CONVERSATION" | "INTERACTION_INCOMPLETE" | "INTERACTION_UNSUPPORTED" | "INTERACTION_UNRESOLVED" |
    "INTERACTION_MISSING_TARGET" | "INTERACTION_MISSING_DESTINATION" | "INTERACTION_AMBIGUOUS_REFERENCE" | "INTERACTION_UNRESOLVED_REFERENCE" | "INTERACTION_INVALID_LITERAL" | "INTERACTION_UNSUPPORTED_OPERATION";
  intent: NormalizedIntent;
  commitPackage: never;
  commitPackages?: never;
  partial?: false;
}
export type TurnResult = CommittedTurnResult | BoundaryTurnResult | EvidenceTurnResult | InterfaceTurnResult;

export class BedroomTurnError extends Error {}

export class PassingBedroomJury implements BedroomJury {
  async review(batch: JuryBatch): Promise<JuryReport[]> {
    return batch.candidates.map((candidate) => ({ candidateId: candidate.candidateId, verdict: "pass", violations: [] }));
  }
}

export class ChineseBedroomRenderer implements TurnRenderer {
  async render(): Promise<string> {
    return "你从床沿站起来时，发麻的左腿让身体晃了一下。你放慢脚步走到门边，握住把手，将门打开。";
  }
}
