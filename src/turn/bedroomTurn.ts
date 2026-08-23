import { prepareCommitPackage } from "../protocol/commit.js";
import { createJuryBatch, evaluateCandidateEnvelope } from "../protocol/evaluator.js";
import { selectCandidate } from "../protocol/selector.js";
import type { CandidateEnvelope, CommitPackage, JuryBatch, JuryReport, ProjectionSnapshot } from "../protocol/types.js";
import { validateCandidateEnvelope } from "../protocol/validator.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BEDROOM_PROJECTIONS, type BedroomFixture } from "../world/bedroomFixture.js";
import { parseMvpIntent, type NormalizedIntent } from "../world/intent.js";
import { FiniteDomainProjectionResolver } from "../world/projectionResolver.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
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
export type TurnResult = CommittedTurnResult | BoundaryTurnResult | EvidenceTurnResult;

export class BedroomTurnError extends Error {}

function buildCandidate(): CandidateEnvelope {
  return { candidates: [{
    candidateId: "bedroom-open-partial",
    outcomeKind: "partial",
    requiresResolution: [
      { projection: BEDROOM_PROJECTIONS.standOutcome, reason: "Determine whether standing succeeds." },
      { projection: BEDROOM_PROJECTIONS.moveOutcome, reason: "Determine whether movement reaches the door." },
    ],
    conditions: [
      { projection: BEDROOM_PROJECTIONS.standOutcome, operator: "eq", value: "unstable_success" },
      { projection: BEDROOM_PROJECTIONS.moveOutcome, operator: "eq", value: "impaired_success" },
      { projection: BEDROOM_PROJECTIONS.doorOpenState, operator: "eq", value: "closed" },
    ],
    proposedEvents: [
      { eventId: "event-stand", type: "action_result", actionKind: "stand", outcome: "partial", subjectRef: "self" },
      { eventId: "event-move", type: "action_result", actionKind: "move", outcome: "partial", subjectRef: "self", objectRef: "door-1" },
      { eventId: "event-open", type: "action_result", actionKind: "open", outcome: "success", subjectRef: "self", objectRef: "door-1" },
    ],
    proposedStateChanges: [
      { projection: BEDROOM_PROJECTIONS.posture, from: "sitting_on_bed_edge", to: "standing", causedByEventId: "event-stand" },
      { projection: BEDROOM_PROJECTIONS.position, from: "bedside", to: "doorway", causedByEventId: "event-move" },
      { projection: BEDROOM_PROJECTIONS.doorOpenState, from: "closed", to: "open", causedByEventId: "event-open" },
    ],
    observations: [{ kind: "body_feedback", value: "left_leg_unsteady" }],
    newWorldCommitments: [
      { kind: "attribute_set", entityId: "self", attribute: "posture", value: "standing" },
      { kind: "attribute_set", entityId: "self", attribute: "position", value: "doorway" },
      { kind: "attribute_set", entityId: "door-1", attribute: "open_state", value: "open" },
    ],
  }] };
}

export async function runBedroomTurn(options: {
  rawTtd: string;
  turnId: string;
  commitSequence: number;
  fixture: BedroomFixture;
  jury: BedroomJury;
  renderer: TurnRenderer;
  store: LanceCommitStore;
  rootTurnId?: string;
  stepIndex?: number;
  stepCount?: number;
  attemptedTtd?: string;
}): Promise<CommittedTurnResult> {
  const intent = parseMvpIntent(options.rawTtd);
  if (intent.actions.map((action) => action.kind).join(",") !== "stand,move,open") {
    throw new BedroomTurnError("The MVP bedroom turn supports only stand → move → open.");
  }

  const resolver = new FiniteDomainProjectionResolver(
    options.fixture.registry,
    options.fixture.committed,
    options.fixture.latentValues,
  );
  const resolved = resolver.resolveMany([
    BEDROOM_PROJECTIONS.standOutcome,
    BEDROOM_PROJECTIONS.moveOutcome,
  ]);
  const snapshots: ProjectionSnapshot[] = [...options.fixture.committed, ...resolved];
  const envelope = buildCandidate();
  const validation = validateCandidateEnvelope(envelope, options.fixture.registry);
  if (!validation.valid) throw new BedroomTurnError("Candidate protocol validation failed.");
  const evaluation = evaluateCandidateEnvelope(envelope, options.fixture.registry, snapshots);
  if (evaluation.eligibleCandidateIds.length === 0) throw new BedroomTurnError("No eligible bedroom candidate.");
  const batch = createJuryBatch(envelope, validation, evaluation, snapshots);
  if (!batch) throw new BedroomTurnError("Jury batch preparation failed.");
  const reports = await options.jury.review(batch);
  const selection = selectCandidate(envelope, evaluation, reports);
  const prepared = prepareCommitPackage(
    options.turnId,
    options.commitSequence,
    envelope,
    selection,
    snapshots,
    snapshots,
    createObjectWorldFixture().worldBasis,
  );
  if (!prepared.ready || !prepared.commitPackage) throw new BedroomTurnError("Commit package preparation failed.");
  if (options.rootTurnId !== undefined) prepared.commitPackage.rootTurnId = options.rootTurnId;
  if (options.stepIndex !== undefined) prepared.commitPackage.stepIndex = options.stepIndex;
  if (options.stepCount !== undefined) prepared.commitPackage.stepCount = options.stepCount;
  if (options.attemptedTtd !== undefined) prepared.commitPackage.attemptedTtd = options.attemptedTtd;
  await options.store.append(prepared.commitPackage, {
    seedCommitments: createObjectWorldFixture().seedCommitments,
  });
  const response = await options.renderer.render(prepared.commitPackage, intent);
  return { kind: "committed", response, commitPackage: prepared.commitPackage, intent };
}

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
