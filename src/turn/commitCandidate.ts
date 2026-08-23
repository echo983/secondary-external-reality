import { prepareCommitPackage } from "../protocol/commit.js";
import { createJuryBatch, evaluateCandidateEnvelope } from "../protocol/evaluator.js";
import { selectCandidate } from "../protocol/selector.js";
import type { CandidateEnvelope, CommitPackage, ProjectionDefinition, ProjectionSnapshot } from "../protocol/types.js";
import { validateCandidateEnvelope } from "../protocol/validator.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import type { BedroomJury } from "./bedroomTurn.js";

export class CandidateCommitError extends Error {}

export async function commitCandidateEnvelope(options: {
  envelope: CandidateEnvelope;
  registry: ProjectionDefinition[];
  snapshots: ProjectionSnapshot[];
  turnId: string;
  commitSequence: number;
  jury: BedroomJury;
  store: LanceCommitStore;
}): Promise<CommitPackage> {
  const validation = validateCandidateEnvelope(options.envelope, options.registry);
  if (!validation.valid) throw new CandidateCommitError("Candidate protocol validation failed.");
  const evaluation = evaluateCandidateEnvelope(options.envelope, options.registry, options.snapshots);
  const batch = createJuryBatch(options.envelope, validation, evaluation, options.snapshots);
  if (!batch) throw new CandidateCommitError("Candidate is not eligible.");
  const selection = selectCandidate(options.envelope, evaluation, await options.jury.review(batch));
  const prepared = prepareCommitPackage(options.turnId, options.commitSequence, options.envelope, selection, options.snapshots, options.snapshots);
  if (!prepared.ready || !prepared.commitPackage) throw new CandidateCommitError("Commit preparation failed.");
  await options.store.append(prepared.commitPackage);
  return prepared.commitPackage;
}
