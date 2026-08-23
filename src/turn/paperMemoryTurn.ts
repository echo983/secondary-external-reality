import { prepareCommitPackage } from "../protocol/commit.js";
import { createJuryBatch, evaluateCandidateEnvelope } from "../protocol/evaluator.js";
import { selectCandidate } from "../protocol/selector.js";
import type { CandidateEnvelope, CommitPackage, ProjectionDefinition, ProjectionSnapshot } from "../protocol/types.js";
import { validateCandidateEnvelope } from "../protocol/validator.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { parseMvpIntent, type NormalizedIntent } from "../world/intent.js";
import type { BedroomJury, TurnResult } from "./bedroomTurn.js";

export type PaperIntent = { kind: "write_and_hide"; inscription: string } | { kind: "find_and_read" } | { kind: "unsupported" };
export class PaperMemoryTurnError extends Error {}

export function parsePaperIntent(rawTtd: string): PaperIntent {
  const text = rawTtd.trim();
  const mentionsPaper = /(纸条|note|paper)/iu.test(text);
  const mentionsPillow = /(枕头|pillow)/iu.test(text);
  const number = text.match(/[0-9]{1,64}/u)?.[0];
  if (mentionsPaper && mentionsPillow && number && /(写|write|put|放|藏)/iu.test(text)) {
    return { kind: "write_and_hide", inscription: number };
  }
  if (mentionsPillow && /(找|看|翻|检查|读|find|look|check|read)/iu.test(text)) return { kind: "find_and_read" };
  return { kind: "unsupported" };
}

async function commitEnvelope(options: {
  envelope: CandidateEnvelope;
  registry: ProjectionDefinition[];
  snapshots: ProjectionSnapshot[];
  turnId: string;
  commitSequence: number;
  jury: BedroomJury;
  store: LanceCommitStore;
}): Promise<CommitPackage> {
  const validation = validateCandidateEnvelope(options.envelope, options.registry);
  if (!validation.valid) throw new PaperMemoryTurnError("Paper candidate protocol validation failed.");
  const evaluation = evaluateCandidateEnvelope(options.envelope, options.registry, options.snapshots);
  const batch = createJuryBatch(options.envelope, validation, evaluation, options.snapshots);
  if (!batch) throw new PaperMemoryTurnError("Paper candidate is not eligible.");
  const selection = selectCandidate(options.envelope, evaluation, await options.jury.review(batch));
  const prepared = prepareCommitPackage(options.turnId, options.commitSequence, options.envelope, selection, options.snapshots, options.snapshots);
  if (!prepared.ready || !prepared.commitPackage) throw new PaperMemoryTurnError("Paper commit preparation failed.");
  await options.store.append(prepared.commitPackage);
  return prepared.commitPackage;
}

export async function runPaperMemoryTurn(options: {
  rawTtd: string;
  turnId: string;
  commitSequence: number;
  priorCommits: CommitPackage[];
  jury: BedroomJury;
  store: LanceCommitStore;
}): Promise<TurnResult> {
  const paperIntent = parsePaperIntent(options.rawTtd);
  const intent: NormalizedIntent = parseMvpIntent(options.rawTtd);
  const chinese = intent.inputLanguage === "zh";

  if (paperIntent.kind === "write_and_hide") {
    const entityId = `note-${options.commitSequence}`;
    const capabilityProjection = `entity:self.action_outcome.write_and_hide_note_now`;
    const pillowProjection = "entity:pillow-1.exists";
    const registry: ProjectionDefinition[] = [
      { address: pillowProjection, state: "known", allowedValues: ["true"], value: "true" },
      { address: capabilityProjection, state: "unknown", allowedValues: ["success", "failure"] },
    ];
    const snapshots: ProjectionSnapshot[] = [
      { projection: pillowProjection, value: "true", revision: 0 },
      { projection: capabilityProjection, value: "success", revision: options.commitSequence },
    ];
    const envelope: CandidateEnvelope = { candidates: [{
      candidateId: `write-hide-${entityId}`,
      outcomeKind: "success",
      requiresResolution: [{ projection: capabilityProjection, reason: "Resolve whether writing and placing the note succeeds." }],
      conditions: [
        { projection: pillowProjection, operator: "eq", value: "true" },
        { projection: capabilityProjection, operator: "eq", value: "success" },
      ],
      proposedEvents: [
        { eventId: `${entityId}-write`, type: "action_result", actionKind: "write", outcome: "success", subjectRef: "self", objectRef: entityId },
        { eventId: `${entityId}-place`, type: "action_result", actionKind: "place", outcome: "success", subjectRef: "self", objectRef: entityId },
      ],
      proposedStateChanges: [],
      observations: [],
      newWorldCommitments: [
        { kind: "entity_created", entityId, entityType: "paper_note" },
        { kind: "attribute_set", entityId, attribute: "inscription", value: paperIntent.inscription },
        { kind: "relation_set", subjectId: entityId, predicate: "contained_by", objectId: "pillow-1" },
      ],
    }] };
    const commitPackage = await commitEnvelope({ ...options, envelope, registry, snapshots });
    const response = chinese
      ? `你在纸条上写下“${paperIntent.inscription}”，把它放在枕头下面。`
      : `You write “${paperIntent.inscription}” on the note and place it under the pillow.`;
    return { response, commitPackage, intent };
  }

  if (paperIntent.kind === "find_and_read") {
    const world = MaterializedWorld.replay(options.priorCommits);
    const notes = world.entitiesRelatedTo("contained_by", "pillow-1").filter((entity) => entity.entityType === "paper_note" && entity.attributes.inscription !== undefined);
    if (notes.length !== 1) throw new PaperMemoryTurnError(notes.length === 0 ? "No readable note is under the pillow." : "More than one readable note is under the pillow.");
    const note = notes[0]!;
    const locationProjection = `entity:${note.entityId}.contained_by`;
    const inscriptionProjection = `entity:${note.entityId}.inscription`;
    const registry: ProjectionDefinition[] = [
      { address: locationProjection, state: "known", allowedValues: ["pillow-1"], value: "pillow-1" },
      { address: inscriptionProjection, state: "known", allowedValues: [note.attributes.inscription!], value: note.attributes.inscription! },
    ];
    const snapshots: ProjectionSnapshot[] = registry.map((definition) => ({ projection: definition.address, value: definition.value!, revision: note.createdAtSequence }));
    const envelope: CandidateEnvelope = { candidates: [{
      candidateId: `find-read-${note.entityId}`,
      outcomeKind: "success",
      requiresResolution: [],
      conditions: [
        { projection: locationProjection, operator: "eq", value: "pillow-1" },
        { projection: inscriptionProjection, operator: "eq", value: note.attributes.inscription! },
      ],
      proposedEvents: [
        { eventId: `${note.entityId}-find-${options.commitSequence}`, type: "action_result", actionKind: "find", outcome: "success", subjectRef: "self", objectRef: note.entityId },
        { eventId: `${note.entityId}-read-${options.commitSequence}`, type: "action_result", actionKind: "read", outcome: "success", subjectRef: "self", objectRef: note.entityId },
      ],
      proposedStateChanges: [],
      observations: [{ kind: "inscription_read", entityId: note.entityId, value: note.attributes.inscription }],
      newWorldCommitments: [],
    }] };
    const commitPackage = await commitEnvelope({ ...options, envelope, registry, snapshots });
    const response = chinese
      ? `你在枕头下面找到那张纸条。上面写着“${note.attributes.inscription}”。`
      : `You find the note under the pillow. It reads “${note.attributes.inscription}”.`;
    return { response, commitPackage, intent };
  }
  throw new PaperMemoryTurnError("Unsupported paper-memory intent.");
}
