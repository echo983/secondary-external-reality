import type { CandidateEnvelope, EpistemicChange, EvidenceRecord, ProjectionDefinition, ProjectionSnapshot, WorldCommitment } from "../protocol/types.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { MaterializedWorld, type MaterializedEntity, type MaterializedRelation } from "../world/materializedWorld.js";
import { createObjectWorldFixture, resolveFixtureEntity, type ObjectWorldFixture } from "../world/objectFixture.js";
import { parseMvpIntent } from "../world/intent.js";
import { parseObjectIntent, type ObjectIntent } from "../world/objectIntent.js";
import type { BedroomJury, TurnResult } from "./bedroomTurn.js";
import { commitCandidateEnvelope } from "./commitCandidate.js";

export class ObjectTurnError extends Error {}

function candidatesByCapability(world: MaterializedWorld, ids: string[], attribute: string): MaterializedEntity[] {
  return ids.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.attributes[attribute] === "true");
}

function exactlyOne<T>(values: T[], label: string): T {
  if (values.length !== 1) throw new ObjectTurnError(values.length === 0 ? `No ${label} matched.` : `The ${label} reference is ambiguous.`);
  return values[0]!;
}

function fact(
  registry: ProjectionDefinition[],
  snapshots: ProjectionSnapshot[],
  conditions: CandidateEnvelope["candidates"][number]["conditions"],
  projection: string,
  value: string,
  revision: number,
  allowedValues: string[] = [value],
): void {
  registry.push({ address: projection, state: "known", allowedValues, value });
  snapshots.push({ projection, value, revision: Math.max(0, revision) });
  conditions.push({ projection, operator: "eq", value });
}

function currentLocation(world: MaterializedWorld, entity: MaterializedEntity): MaterializedRelation {
  const location = world.directLocation(entity.entityId);
  if (!location) throw new ObjectTurnError(`${entity.entityId} has no direct location.`);
  return location;
}

function label(entity: MaterializedEntity, language: "zh" | "en"): string {
  return entity.attributes[language === "zh" ? "zh_name" : "en_name"] ?? entity.entityType;
}

export async function runObjectTurn(options: {
  rawTtd: string;
  turnId: string;
  commitSequence: number;
  priorCommits: Awaited<ReturnType<LanceCommitStore["list"]>>;
  jury: BedroomJury;
  store: LanceCommitStore;
  fixture?: ObjectWorldFixture;
}): Promise<TurnResult> {
  const parsed = parseObjectIntent(options.rawTtd);
  if (!parsed) throw new ObjectTurnError("Unsupported object intent.");
  const fixture = options.fixture ?? createObjectWorldFixture();
  const world = MaterializedWorld.replay(options.priorCommits, fixture.seedCommitments);
  const mentionedIds = resolveFixtureEntity(fixture, parsed.rawTtd);
  const registry: ProjectionDefinition[] = [];
  const snapshots: ProjectionSnapshot[] = [];
  const conditions: CandidateEnvelope["candidates"][number]["conditions"] = [];
  const commitments: WorldCommitment[] = [];
  const events: CandidateEnvelope["candidates"][number]["proposedEvents"] = [];
  const observations: unknown[] = [];
  const evidenceGenerated: EvidenceRecord[] = [];
  const epistemicChanges: EpistemicChange[] = [];
  let response: string;

  if (parsed.operation === "open_and_observe") {
    const container = exactlyOne(candidatesByCapability(world, mentionedIds, "openable").filter((entity) => entity.attributes.container === "true"), "openable container");
    const target = exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.attributes.portable === "true"), "observable object");
    const location = currentLocation(world, target);
    if (location.predicate !== "contained_by" || location.objectId !== container.entityId) throw new ObjectTurnError(`${target.entityId} is not inside ${container.entityId}.`);
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    if (container.attributes.open_state === "closed") {
      fact(registry, snapshots, conditions, `entity:${container.entityId}.open_state`, "closed", container.attributeRevisions.open_state ?? 0, ["closed", "open"]);
      events.push({ eventId: `event-open-${container.entityId}-${options.commitSequence}`, type: "action_result", actionKind: "open", outcome: "success", subjectRef: "self", objectRef: container.entityId });
      commitments.push({ kind: "attribute_set", entityId: container.entityId, attribute: "open_state", value: "open" });
    } else if (container.attributes.open_state !== "open") {
      throw new ObjectTurnError(`${container.entityId} cannot be opened.`);
    }
    const eventId = `event-observe-${target.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "observe", outcome: "success", subjectRef: "self", objectRef: target.entityId });
    const evidenceId = `evidence-location-${target.entityId}-${options.commitSequence}`;
    evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: eventId, subjectId: target.entityId, predicate: location.predicate, objectId: location.objectId });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    response = parsed.inputLanguage === "zh" ? `你打开${label(container, "zh")}，在里面找到了${label(target, "zh")}。` : `You open the ${label(container, "en")} and find the ${label(target, "en")} inside.`;
  } else if (parsed.operation === "open" || parsed.operation === "close") {
    const target = exactlyOne(candidatesByCapability(world, mentionedIds, "openable"), "openable object");
    const expected = parsed.operation === "open" ? "closed" : "open";
    const next = parsed.operation === "open" ? "open" : "closed";
    if (target.attributes.open_state !== expected) throw new ObjectTurnError(`${target.entityId} is not ${expected}.`);
    fact(registry, snapshots, conditions, `entity:${target.entityId}.open_state`, expected, target.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    const eventId = `event-${parsed.operation}-${target.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: parsed.operation, outcome: "success", subjectRef: "self", objectRef: target.entityId });
    commitments.push({ kind: "attribute_set", entityId: target.entityId, attribute: "open_state", value: next });
    response = parsed.inputLanguage === "zh" ? `你${parsed.operation === "open" ? "打开" : "关上"}了${label(target, "zh")}。` : `You ${parsed.operation} the ${label(target, "en")}.`;
  } else if (parsed.operation === "take") {
    const object = exactlyOne(candidatesByCapability(world, mentionedIds, "portable"), "portable object");
    const location = currentLocation(world, object);
    if (location.predicate === "held_by" && location.objectId === "self") throw new ObjectTurnError(`${object.entityId} is already held.`);
    if (location.predicate === "contained_by") {
      const container = world.entities.get(location.objectId);
      if (container?.attributes.openable === "true" && container.attributes.open_state !== "open") throw new ObjectTurnError(`${container.entityId} is closed.`);
      if (container?.attributes.openable === "true") fact(registry, snapshots, conditions, `entity:${container.entityId}.open_state`, "open", container.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    }
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    const eventId = `event-take-${object.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "take", outcome: "success", subjectRef: "self", objectRef: object.entityId });
    commitments.push(
      { kind: "relation_ended", relationId: location.relationId },
      { kind: "relation_asserted", relationId: `${object.entityId}-location-${options.commitSequence}`, subjectId: object.entityId, predicate: "held_by", objectId: "self" },
    );
    response = parsed.inputLanguage === "zh" ? `你拿起了${label(object, "zh")}。` : `You take the ${label(object, "en")}.`;
  } else if (parsed.operation === "place") {
    const object = exactlyOne(candidatesByCapability(world, mentionedIds, "portable"), "portable object");
    const surface = exactlyOne(candidatesByCapability(world, mentionedIds, "surface"), "surface");
    const location = currentLocation(world, object);
    if (location.predicate !== "held_by" || location.objectId !== "self") throw new ObjectTurnError(`${object.entityId} is not held by self.`);
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    const eventId = `event-place-${object.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "place", outcome: "success", subjectRef: "self", objectRef: object.entityId });
    commitments.push(
      { kind: "relation_ended", relationId: location.relationId },
      { kind: "relation_asserted", relationId: `${object.entityId}-location-${options.commitSequence}`, subjectId: object.entityId, predicate: "located_on", objectId: surface.entityId },
    );
    response = parsed.inputLanguage === "zh" ? `你把${label(object, "zh")}放在${label(surface, "zh")}上。` : `You place the ${label(object, "en")} on the ${label(surface, "en")}.`;
  } else if (parsed.operation === "put_inside") {
    const object = exactlyOne(candidatesByCapability(world, mentionedIds, "portable"), "portable object");
    const containers = candidatesByCapability(world, mentionedIds, "container").filter((entity) => entity.entityId !== object.entityId);
    const container = exactlyOne(containers, "container");
    const location = currentLocation(world, object);
    if (location.predicate !== "held_by" || location.objectId !== "self") throw new ObjectTurnError(`${object.entityId} is not held by self.`);
    if (container.attributes.openable === "true" && container.attributes.open_state !== "open") throw new ObjectTurnError(`${container.entityId} is closed.`);
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    if (container.attributes.openable === "true") fact(registry, snapshots, conditions, `entity:${container.entityId}.open_state`, "open", container.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    const eventId = `event-put-${object.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "put_inside", outcome: "success", subjectRef: "self", objectRef: object.entityId });
    commitments.push(
      { kind: "relation_ended", relationId: location.relationId },
      { kind: "relation_asserted", relationId: `${object.entityId}-location-${options.commitSequence}`, subjectId: object.entityId, predicate: "contained_by", objectId: container.entityId },
    );
    response = parsed.inputLanguage === "zh" ? `你把${label(object, "zh")}放进了${label(container, "zh")}。` : `You put the ${label(object, "en")} into the ${label(container, "en")}.`;
  } else {
    const visible = mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity !== undefined);
    const target = exactlyOne(visible.filter((entity) => entity.entityType !== "person"), "observable object");
    const location = currentLocation(world, target);
    if (location.predicate === "contained_by") {
      const container = world.entities.get(location.objectId);
      if (container?.attributes.openable === "true" && container.attributes.open_state !== "open") throw new ObjectTurnError(`${container.entityId} is closed.`);
    }
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    const eventId = `event-observe-${target.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "observe", outcome: "success", subjectRef: "self", objectRef: target.entityId });
    const evidenceId = `evidence-location-${target.entityId}-${options.commitSequence}`;
    evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: eventId, subjectId: target.entityId, predicate: location.predicate, objectId: location.objectId });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    response = parsed.inputLanguage === "zh" ? `你找到了${label(target, "zh")}。` : `You find the ${label(target, "en")}.`;
  }

  const candidateId = `object-${parsed.operation}-${options.commitSequence}`;
  const envelope: CandidateEnvelope = { candidates: [{ candidateId, outcomeKind: "success", requiresResolution: [], conditions, proposedEvents: events, proposedStateChanges: [], observations, evidenceGenerated, epistemicChanges, newWorldCommitments: commitments }] };
  const commitPackage = await commitCandidateEnvelope({ ...options, envelope, registry, snapshots });
  return { response, commitPackage, intent: parseMvpIntent(options.rawTtd) };
}

export function isObjectIntent(rawTtd: string): boolean {
  const parsed = parseObjectIntent(rawTtd);
  if (!parsed) return false;
  const ids = resolveFixtureEntity(createObjectWorldFixture(), rawTtd);
  return ids.some((id) => id !== "door-1");
}
