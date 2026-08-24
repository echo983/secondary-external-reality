import { createHash } from "node:crypto";
import type { CandidateEnvelope, EpistemicChange, EvidenceRecord, ProjectionDefinition, ProjectionSnapshot, WorldCommitment } from "../protocol/types.js";
import type { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { MaterializedWorld, type MaterializedEntity, type MaterializedRelation } from "../world/materializedWorld.js";
import { createObjectWorldFixture, resolveFixtureEntity, type ObjectWorldFixture } from "../world/objectFixture.js";
import { HALLWAY_NOTABLE_FEATURES, LIVING_ROOM_NOTABLE_FEATURES } from "../world/worldSchema.js";
import { parseMvpIntent } from "../world/intent.js";
import { parseObjectIntent, type ObjectIntent } from "../world/objectIntent.js";
import type { BedroomJury, TurnResult } from "./bedroomTurn.js";
import { commitCandidateEnvelope } from "./commitCandidate.js";
import { isEntityPerceivable, roomForPosition, PLACE_VISIBILITY_EXCEPTIONS } from "../query/perceptionPolicy.js";
import { triageFixedQuery } from "../query/queryTriage.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import type { PublicBoundaryCode } from "../presentation/types.js";
import type { FixedQueryKind, QueryRequest } from "../query/types.js";
import { buildCanonicalQueryEnvelope, type CompleteRelationSetInput } from "../query/canonicalQueryEnvelope.js";
import type { ApprovedPresentationItem, ApprovedPresentationPacket } from "../presentation/types.js";
import { entityAttributeAddress, relationSlotAddress } from "../world/semanticAddress.js";
import { DeterministicPresentationRenderer, RiskAwarePresentationRenderer, type ApprovedPresentationRenderer } from "../presentation/renderer.js";

export class ObjectTurnError extends Error {}

// Doorway/bedside are anchored to the existing door/bed landmark entities;
// hallway-1/living-room-1 are real Place entities (docs/MVP-hallway-placegraph-design-v0.4.md,
// -living-room-design-v0.5.md). Still a strictly linear chain — a full graph
// data structure would be premature for four nodes on one path.
type PositionValue = "bedside" | "doorway" | "hallway" | "living_room";

const MOVE_DESTINATIONS: Readonly<Record<string, PositionValue>> = {
  "door-1": "doorway", "bed-1": "bedside", "hallway-1": "hallway", "living-room-1": "living_room",
};

// How many real (WorldTruth-committing) turns a recollection stays exact for,
// counted as a distance between commitSequence numbers, not wall-clock time or
// raw turn count — see docs/MVP-memory-recollection-design-v0.6.md §3. Kept
// deliberately small so a live-eval sequence can cross it in a handful of
// filler moves; not a claim about real forgetting curves.
const RECALL_FIDELITY_WINDOW = 4;

// Reverse of the two place rows above, restricted to positions that host a
// Free-projection place — used to detect "self is currently standing inside
// a place with unresolved content" without hardcoding which place that is.
const POSITION_PLACE_ID: Readonly<Partial<Record<PositionValue, string>>> = {
  hallway: "hallway-1", living_room: "living-room-1",
};

// Adjacency between position values, with an optional door entity that must
// be open to cross that edge. Both directions of a door-gated edge are
// listed explicitly and independently — closing the door from either side
// blocks crossing from either side, not just outbound. bedside and doorway
// are both treated as directly reachable from hallway (matching the
// pre-existing, already-tested bedroom-side UX where you can walk straight
// out to or in from the hallway without a separate doorway stop — the same
// two-position collapse perceptionPolicy's "bedroom" room already makes);
// what changed from the pre-generalization version is that ALL FOUR
// directions across door-1 are now gated, not just bedroom->hallway.
interface MoveEdge { to: PositionValue; requiresOpenDoor?: string }
const PLACE_ADJACENCY: Readonly<Record<PositionValue, readonly MoveEdge[]>> = {
  bedside: [{ to: "doorway" }, { to: "hallway", requiresOpenDoor: "door-1" }],
  doorway: [{ to: "bedside" }, { to: "hallway", requiresOpenDoor: "door-1" }],
  hallway: [{ to: "doorway", requiresOpenDoor: "door-1" }, { to: "bedside", requiresOpenDoor: "door-1" }, { to: "living_room" }],
  living_room: [{ to: "hallway" }],
};

// Every Place entity with a genuinely Free notable_feature projection, and
// the closed value domain ΠS may resolve it into. Both entries share the one
// resolver below — nothing here is hallway- or living-room-specific.
const PLACE_FREE_PROJECTIONS: Readonly<Record<string, { valueDomain: readonly string[] }>> = {
  "hallway-1": { valueDomain: HALLWAY_NOTABLE_FEATURES },
  "living-room-1": { valueDomain: LIVING_ROOM_NOTABLE_FEATURES },
};

// Deterministic ΠS/LazyRealizer: a place's notable_feature is genuinely Free
// until the first time it is operationally addressed. Seeded from the
// committed worldBasis.seedHash plus the place's own id (so two places never
// accidentally resolve in lockstep even if they share a value domain), so
// the same world always resolves the same value, and it is never re-resolved
// once committed (I6 CounterfactualStability) — see design doc §3.2/§3.
function resolvePlaceNotableFeature(placeId: string, seedHash: string, valueDomain: readonly string[]): string {
  const digest = createHash("sha256").update(`${seedHash}:${placeId}.notable_feature`).digest();
  const index = digest.readUInt32BE(0) % valueDomain.length;
  return valueDomain[index]!;
}

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
  const fallbackZh: Record<string, string> = { bed: "床", door: "门", drawer: "抽屉", key: "钥匙", pen: "笔", paper_note: "纸条", pillow: "枕头", table: "桌子", nightstand: "床头柜" };
  return entity.attributes[language === "zh" ? "zh_name" : "en_name"] ?? (language === "zh" ? fallbackZh[entity.entityType] : undefined) ?? entity.entityType;
}

// Physical manipulation requires the target to be perceivable from self's
// current position — reusing isEntityPerceivable rather than inventing a
// separate "reach" predicate, since on this MVP's object set the two are
// equivalent: PLACE_VISIBILITY_EXCEPTIONS only ever applies to hallway-1/
// living-room-1 themselves, never to a take/open/place-able physical object
// (docs/MVP-subject-physical-reach-capability-design-v0.7.md §2). If a future
// change ever grants a manipulable object a cross-room visibility exception,
// this equivalence breaks and this check must switch to a stricter predicate
// that ignores PLACE_VISIBILITY_EXCEPTIONS.
function requireReachable(world: MaterializedWorld, entity: MaterializedEntity, language: "zh" | "en"): void {
  if (isEntityPerceivable(world, entity)) return;
  throw new ObjectTurnError(language === "zh" ? `你现在够不着${label(entity, "zh")}。` : `You cannot reach the ${label(entity, "en")} from here.`);
}

function relationWords(relation: MaterializedRelation, object: MaterializedEntity, language: "zh" | "en"): string {
  const place = label(object, language);
  if (language === "zh") return relation.predicate === "held_by" ? "在你手里" : relation.predicate === "contained_by" ? `在${place}里面` : relation.predicate === "part_of" ? `是${place}的一部分` : `在${place}上`;
  return relation.predicate === "held_by" ? "in your hand" : relation.predicate === "contained_by" ? `inside the ${place}` : relation.predicate === "part_of" ? `part of the ${place}` : `on the ${place}`;
}

export async function runObjectTurn(options: {
  rawTtd: string;
  turnId: string;
  commitSequence: number;
  priorCommits: Awaited<ReturnType<LanceCommitStore["list"]>>;
  jury: BedroomJury;
  store: LanceCommitStore;
  fixture?: ObjectWorldFixture;
  rootTurnId?: string;
  stepIndex?: number;
  stepCount?: number;
  attemptedTtd?: string;
  objectIntent?: ObjectIntent;
  mentionedEntityIds?: string[];
  queryRenderer?: ApprovedPresentationRenderer;
}): Promise<TurnResult> {
  const parsed = options.objectIntent ?? parseObjectIntent(options.rawTtd);
  if (!parsed) throw new ObjectTurnError("Unsupported object intent.");
  const fixture = options.fixture ?? createObjectWorldFixture();
  const deterministicRenderer = new DeterministicPresentationRenderer();
  const queryRenderer = new RiskAwarePresentationRenderer(options.queryRenderer ?? deterministicRenderer, deterministicRenderer);
  for (const commit of options.priorCommits) {
    if (commit.worldBasis && (commit.worldBasis.fixtureId !== fixture.worldBasis.fixtureId || commit.worldBasis.fixtureVersion !== fixture.worldBasis.fixtureVersion || commit.worldBasis.seedHash !== fixture.worldBasis.seedHash)) {
      throw new ObjectTurnError("Committed world basis does not match the active fixture.");
    }
  }
  const world = MaterializedWorld.replay(options.priorCommits, fixture.seedCommitments);
  const mentionedIds = options.mentionedEntityIds ?? resolveFixtureEntity(fixture, parsed.rawTtd);
  const selfQuery = parsed.operation === "self_position" || parsed.operation === "self_posture" || parsed.operation === "self_bed_status" || (parsed.operation === "locate" && mentionedIds.length === 1 && mentionedIds[0] === "self");
  // Matches the branch below that resolves/reads a place's notable_feature.
  // "observe" has no queryKind (unmapped), so without this the canonical
  // envelope (and therefore any rendered response text) would silently never
  // get built for that compiled shape — the same observe/inspect_contents
  // inconsistency the drawer-contents Query Confluence finding surfaced.
  // look_around triggers on whichever Free-projection place self currently
  // stands in (if any); the other query verbs trigger on an explicit mention
  // of a place entity, from anywhere it happens to be reachable/visible from.
  const currentPlaceId = POSITION_PLACE_ID[world.entities.get("self")?.attributes.position as PositionValue];
  const mentionedPlaceId = mentionedIds.length === 1 && Object.hasOwn(PLACE_FREE_PROJECTIONS, mentionedIds[0]!) ? mentionedIds[0] : undefined;
  const targetPlaceId = parsed.operation === "look_around" ? currentPlaceId : mentionedPlaceId;
  const placeContentQuery = (parsed.operation === "look_around" && currentPlaceId !== undefined)
    || (["observe", "inspect_contents", "locate"].includes(parsed.operation) && mentionedPlaceId !== undefined);
  const queryKind: FixedQueryKind | undefined = parsed.operation === "inspect_contents" ? "inspect_contents"
    : parsed.operation === "locate" ? "locate"
      : parsed.operation === "inspect_inscription_presence" || parsed.operation === "inspect_inscription_value" ? "inspect_attribute"
        : parsed.operation === "look_around" ? "look_around" : parsed.operation === "inventory" ? "inventory" : undefined;
  if (queryKind && !selfQuery) {
    const targetEntityId = mentionedIds.length === 1 ? mentionedIds[0] : undefined;
    const propositionAddress = queryKind === "inspect_attribute" && targetEntityId ? entityAttributeAddress(targetEntityId, "inscription") : undefined;
    const request: QueryRequest = { queryId: `${options.turnId}:query`, agentId: "self", kind: queryKind, ...(targetEntityId ? { targetEntityId } : {}), ...(propositionAddress ? { propositionAddress } : {}), language: parsed.inputLanguage };
    const epistemic = replayCanonicalViews(options.priorCommits, { seedCommitments: fixture.seedCommitments }).epistemic;
    const decision = triageFixedQuery(request, world, epistemic);
    if (decision.kind === "consult_acquired_evidence" && request.propositionAddress) {
      const edge = epistemic.evidenceFor(request.agentId, request.propositionAddress).find((entry) => entry.evidenceId === decision.evidenceId)!;
      const evidence = { kind: request.kind === "inspect_relation" || request.kind === "locate" ? "relation_evidence" as const : "attribute_evidence" as const,
        semanticAddress: request.propositionAddress, value: Array.isArray(edge.representedValue) ? edge.representedValue.join(",") : edge.representedValue, evidenceId: edge.evidenceId };
      const packet = { packetId: `${options.turnId}:prior-evidence`, outcome: "answer" as const, language: parsed.inputLanguage,
        items: [{ kind: "prior_evidence" as const, evidence, acquiredAtCommitSequence: edge.acquiredAtCommitSequence }] };
      return { kind: "evidence", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never };
    }
    if (decision.kind === "epistemic_boundary" || decision.kind === "unsupported_boundary" || decision.kind === "resolution_deferred") {
      const code: PublicBoundaryCode = decision.code;
      const zh: Record<PublicBoundaryCode, string> = {
        TARGET_NOT_PERCEIVABLE: "你现在无法感知到目标。", CONTAINER_CLOSED: "容器关着，你现在看不到里面。", NO_ACQUIRED_EVIDENCE: "你没有可供查阅的既有证据。",
        UNSUPPORTED_PROJECTION: "当前世界还不能回答这个问题。", RESOLUTION_DEFERRED: "这个事实目前尚未固定。", AMBIGUOUS_TARGET: "你指的目标不够明确。", RECOLLECTION_FADED: "你努力回想，但已经记不清了。",
        OUT_OF_OBSERVATION_BANDWIDTH: "你离得太远，看不清上面写的字。",
      };
      const en: Record<PublicBoundaryCode, string> = {
        TARGET_NOT_PERCEIVABLE: "You cannot currently perceive the target.", CONTAINER_CLOSED: "The container is closed, so you cannot see inside.", NO_ACQUIRED_EVIDENCE: "You have no acquired evidence to consult.",
        UNSUPPORTED_PROJECTION: "The current world cannot answer that yet.", RESOLUTION_DEFERRED: "That fact has not yet been fixed.", AMBIGUOUS_TARGET: "The target is ambiguous.", RECOLLECTION_FADED: "You try to recall, but it's faded from memory.",
        OUT_OF_OBSERVATION_BANDWIDTH: "You are too far away to make out what is written on it.",
      };
      const packet = { packetId: `${options.turnId}:boundary`, outcome: "boundary" as const, language: parsed.inputLanguage, items: [{ kind: "boundary" as const, code }] };
      return { kind: "boundary", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never };
    }
    // Room-level perceivability (checked above) only tells us the note is
    // somewhere self could sense at all; reading its exact digits needs to be
    // close, not just in the same room (docs/MVP-observation-bandwidth-design-v0.8.md).
    // Scoped to inspect_inscription_value only — presence ("is there writing
    // on it") stays room-level, matching the real-world intuition that you can
    // tell a note has ink on it from across a room without reading it.
    if (parsed.operation === "inspect_inscription_value" && world.entities.get("self")?.attributes.position !== "bedside") {
      const packet = { packetId: `${options.turnId}:boundary`, outcome: "boundary" as const, language: parsed.inputLanguage,
        items: [{ kind: "boundary" as const, code: "OUT_OF_OBSERVATION_BANDWIDTH" as PublicBoundaryCode }] };
      return { kind: "boundary", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never };
    }
  }
  if (parsed.operation === "recall_inscription") {
    // Recollection is a channel parallel to, and independent of, the
    // evidence/perception path above: it never touches triageFixedQuery,
    // never checks current perceivability, and — like consult_acquired_evidence
    // and the boundary branch above — returns before the mutable commit
    // arrays are even declared, so it can never produce a WorldCommitment.
    // Forgetting must never look like the world changed; it only means this
    // one epistemic path stops answering precisely, not that the underlying
    // fact was erased (docs/MVP-memory-recollection-design-v0.6.md §4).
    const note = exactlyOne([...world.entities.values()].filter((entity) => entity.entityType === "paper_note"), "paper note");
    const address = entityAttributeAddress(note.entityId, "inscription");
    const epistemic = replayCanonicalViews(options.priorCommits, { seedCommitments: fixture.seedCommitments }).epistemic;
    const latest = epistemic.evidenceFor("self", address).sort((left, right) => right.acquiredAtCommitSequence - left.acquiredAtCommitSequence)[0];
    const faded = latest !== undefined && options.commitSequence - latest.acquiredAtCommitSequence > RECALL_FIDELITY_WINDOW;
    const packet: ApprovedPresentationPacket = !latest || faded
      ? { packetId: `${options.turnId}:recollection-boundary`, outcome: "boundary", language: parsed.inputLanguage,
          items: [{ kind: "boundary", code: latest ? "RECOLLECTION_FADED" : "NO_ACQUIRED_EVIDENCE" }] }
      : { packetId: `${options.turnId}:recollection`, outcome: "answer", language: parsed.inputLanguage,
          items: [{ kind: "recollection", evidence: { kind: "attribute_evidence", semanticAddress: address,
            value: Array.isArray(latest.representedValue) ? latest.representedValue.join(",") : latest.representedValue, evidenceId: latest.evidenceId }, acquiredAtCommitSequence: latest.acquiredAtCommitSequence }] };
    return packet.outcome === "boundary"
      ? { kind: "boundary", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never }
      : { kind: "evidence", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never };
  }
  const registry: ProjectionDefinition[] = [];
  const snapshots: ProjectionSnapshot[] = [];
  const conditions: CandidateEnvelope["candidates"][number]["conditions"] = [];
  const commitments: WorldCommitment[] = [];
  const events: CandidateEnvelope["candidates"][number]["proposedEvents"] = [];
  const observations: unknown[] = [];
  const evidenceGenerated: EvidenceRecord[] = [];
  const epistemicChanges: EpistemicChange[] = [];
  const presentationItems: ApprovedPresentationItem[] = [];
  let completeRelationSet: CompleteRelationSetInput | undefined;
  let response: string;

  if (selfQuery) {
    const self = world.entities.get("self")!;
    const attribute = parsed.operation === "self_posture" || parsed.operation === "self_bed_status" ? "posture" : "position";
    const value = self.attributes[attribute];
    if (!value) throw new ObjectTurnError(`self has no ${attribute}.`);
    fact(registry, snapshots, conditions, `entity:self.${attribute}`, value, self.attributeRevisions[attribute] ?? 0);
    const eventId = `event-self-${attribute}-${options.commitSequence}`;
    const evidenceId = `evidence-self-${attribute}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: `self_${attribute}`, outcome: "success", subjectRef: "self" });
    evidenceGenerated.push({ evidenceId, kind: "attribute_observed", sourceEventId: eventId, subjectId: "self", attribute, value });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    presentationItems.push({ kind: "attribute_evidence", semanticAddress: entityAttributeAddress("self", attribute), value, evidenceId });
    response = "";
  } else if (placeContentQuery && targetPlaceId) {
    // A genuinely Free projection (design doc §3.2/-living-room-design-v0.5.md
    // §3): resolve it deterministically the first time it is operationally
    // addressed, commit it as part of THIS turn, and never re-resolve once
    // committed (I6). This branch covers both "look around while standing in
    // the place" and "observe/locate it from wherever it happens to be
    // perceivable from" — the model compiles the latter as observe,
    // inspect_contents, or occasionally locate, all with the same semantics
    // (see the drawer-contents Query Confluence finding: a query for "what's
    // inside X" is not reliably compiled into one single operation). Shared by
    // every place in PLACE_FREE_PROJECTIONS — hallway-1 and living-room-1 run
    // through the exact same logic below, parameterized only by targetPlaceId.
    const placeEntity = world.entities.get(targetPlaceId)!;
    const selfRoom = roomForPosition(world.entities.get("self")?.attributes.position);
    const exception = PLACE_VISIBILITY_EXCEPTIONS[targetPlaceId];
    if (exception?.requiresOpenDoor && exception.fromRoom === selfRoom) {
      const door = world.entities.get(exception.requiresOpenDoor)!;
      fact(registry, snapshots, conditions, `entity:${exception.requiresOpenDoor}.open_state`, door.attributes.open_state ?? "closed", door.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    }
    if (!isEntityPerceivable(world, placeEntity)) {
      const code: PublicBoundaryCode = "TARGET_NOT_PERCEIVABLE";
      const packet = { packetId: `${options.turnId}:boundary`, outcome: "boundary" as const, language: parsed.inputLanguage, items: [{ kind: "boundary" as const, code }] };
      return { kind: "boundary", response: await queryRenderer.render(packet, options.rawTtd), packet, intent: parseMvpIntent(options.rawTtd), commitPackage: undefined as never };
    }
    const { valueDomain } = PLACE_FREE_PROJECTIONS[targetPlaceId]!;
    const priorValue = placeEntity.attributes.notable_feature;
    const value = priorValue || resolvePlaceNotableFeature(targetPlaceId, fixture.worldBasis.seedHash, valueDomain);
    if (priorValue) {
      fact(registry, snapshots, conditions, `entity:${targetPlaceId}.notable_feature`, priorValue, placeEntity.attributeRevisions.notable_feature ?? 0);
    } else {
      fact(registry, snapshots, conditions, `entity:${targetPlaceId}.notable_feature`, "", placeEntity.attributeRevisions.notable_feature ?? 0, ["", ...valueDomain]);
      commitments.push({ kind: "attribute_set", entityId: targetPlaceId, attribute: "notable_feature", value });
    }
    const eventId = `event-look-around-${targetPlaceId}-${options.commitSequence}`;
    const evidenceId = `evidence-place-feature-${targetPlaceId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "look_around", outcome: "success", subjectRef: "self", objectRef: targetPlaceId });
    evidenceGenerated.push({ evidenceId, kind: "attribute_observed", sourceEventId: eventId, subjectId: targetPlaceId, attribute: "notable_feature", value });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    presentationItems.push({ kind: "attribute_evidence", semanticAddress: entityAttributeAddress(targetPlaceId, "notable_feature"), value, evidenceId });
    response = "";
  } else if (parsed.operation === "look_around") {
    const visible = [...world.entities.values()].filter((entity) => isEntityPerceivable(world, entity)).sort((a, b) => a.entityId.localeCompare(b.entityId));
    const eventId = `event-look-around-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "look_around", outcome: "success", subjectRef: "self" });
    for (const entity of visible) {
      const evidenceId = `evidence-visible-${entity.entityId}-${options.commitSequence}`;
      evidenceGenerated.push({ evidenceId, kind: "entity_observed", sourceEventId: eventId, subjectId: entity.entityId });
      epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    }
    const names = visible.map((entity) => label(entity, parsed.inputLanguage));
    observations.push({ kind: "visible_entities", entityIds: visible.map((entity) => entity.entityId) });
    presentationItems.push({ kind: "observed_entities", entityIds: visible.map((entity) => entity.entityId) });
    // This response is discarded and rebuilt from `observed_entities` by the
    // presentation renderer (look_around has a queryKind), so position-aware
    // wording would need a new presentation item, not a local string — descoped.
    response = parsed.inputLanguage === "zh" ? `你环顾四周，可以看到：${names.join("、")}。` : `You look around and can see: ${names.join(", ")}.`;
  } else if (parsed.operation === "inventory") {
    const held = world.entitiesRelatedTo("held_by", "self");
    const eventId = `event-inventory-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "inventory", outcome: "success", subjectRef: "self" });
    for (const entity of held) {
      const relation = world.directLocation(entity.entityId)!;
      fact(registry, snapshots, conditions, `relation:${relation.relationId}.active`, "true", relation.setAtSequence);
      const evidenceId = `evidence-held-${entity.entityId}-${options.commitSequence}`;
      evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: eventId, subjectId: entity.entityId, predicate: "held_by", objectId: "self" });
      epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    }
    const names = held.map((entity) => label(entity, parsed.inputLanguage));
    observations.push({ kind: "held_entities", entityIds: held.map((entity) => entity.entityId) });
    completeRelationSet = { predicate: "held_by", objectId: "self", subjectIds: held.map((entity) => entity.entityId), sourceEventId: eventId };
    presentationItems.push({ kind: "bounded_relation_set", predicate: "held_by", objectId: "self", subjectIds: held.map((entity) => entity.entityId), complete: true });
    response = parsed.inputLanguage === "zh" ? (names.length ? `你手里拿着：${names.join("、")}。` : "你手里没有拿着东西。") : (names.length ? `You are holding: ${names.join(", ")}.` : "You are not holding anything.");
  } else if (parsed.operation === "inspect_contents") {
    const container = exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.attributes.container === "true"), "container");
    if (container.attributes.openable === "true" && container.attributes.open_state !== "open") throw new ObjectTurnError(`${container.entityId} is closed.`);
    const contents = world.entitiesRelatedTo("contained_by", container.entityId);
    const eventId = `event-inspect-${container.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "inspect_contents", outcome: "success", subjectRef: "self", objectRef: container.entityId });
    for (const entity of contents) {
      const relation = world.directLocation(entity.entityId)!;
      fact(registry, snapshots, conditions, `relation:${relation.relationId}.active`, "true", relation.setAtSequence);
      const evidenceId = `evidence-content-${entity.entityId}-${options.commitSequence}`;
      evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: eventId, subjectId: entity.entityId, predicate: "contained_by", objectId: container.entityId });
      epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    }
    const names = contents.map((entity) => label(entity, parsed.inputLanguage));
    observations.push({ kind: "container_contents", containerId: container.entityId, entityIds: contents.map((entity) => entity.entityId) });
    completeRelationSet = { predicate: "contained_by", objectId: container.entityId, subjectIds: contents.map((entity) => entity.entityId), sourceEventId: eventId };
    presentationItems.push({ kind: "bounded_relation_set", predicate: "contained_by", objectId: container.entityId, subjectIds: contents.map((entity) => entity.entityId), complete: true });
    response = parsed.inputLanguage === "zh" ? (names.length ? `${label(container, "zh")}里面有：${names.join("、")}。` : `${label(container, "zh")}里面是空的。`) : (names.length ? `Inside the ${label(container, "en")} you see: ${names.join(", ")}.` : `The ${label(container, "en")} is empty.`);
  } else if (parsed.operation === "locate") {
    const target = exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity !== undefined && entity.entityType !== "person"), "locatable object");
    if (!isEntityPerceivable(world, target)) throw new ObjectTurnError(`${target.entityId} is not currently visible.`);
    const location = world.structuralLocation(target.entityId);
    if (!location) throw new ObjectTurnError(`${target.entityId} has no structural location.`);
    const locationObject = world.entities.get(location.objectId)!;
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    const eventId = `event-locate-${target.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "locate", outcome: "success", subjectRef: "self", objectRef: target.entityId });
    const evidenceId = `evidence-location-${target.entityId}-${options.commitSequence}`;
    evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: eventId, subjectId: target.entityId, predicate: location.predicate, objectId: location.objectId });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    presentationItems.push({ kind: "relation_evidence", semanticAddress: relationSlotAddress(target.entityId, location.predicate), value: location.objectId, evidenceId });
    response = parsed.inputLanguage === "zh" ? `${label(target, "zh")}${relationWords(location, locationObject, "zh")}。` : `The ${label(target, "en")} is ${relationWords(location, locationObject, "en")}.`;
  } else if (parsed.operation === "write" || parsed.operation === "write_and_hide") {
    const inscription = parsed.content ?? parsed.rawTtd.match(/[0-9]{1,64}/u)?.[0];
    if (!inscription) throw new ObjectTurnError("No numeric inscription was supplied.");
    const note = exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.entityType === "paper_note"), "paper note");
    const pillow = parsed.operation === "write_and_hide"
      ? exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.entityType === "pillow"), "pillow")
      : undefined;
    const pen = exactlyOne([...world.entities.values()].filter((entity) => entity.entityType === "pen"), "pen");
    if (note.attributes.inscription !== "") throw new ObjectTurnError(`${note.entityId} already has an inscription.`);
    const noteLocation = currentLocation(world, note);
    const penLocation = currentLocation(world, pen);
    if (!isEntityPerceivable(world, note) || !isEntityPerceivable(world, pen)) throw new ObjectTurnError("Writing requires a perceivable note and pen.");
    if (penLocation.predicate !== "held_by" || penLocation.objectId !== "self") {
      throw new ObjectTurnError(parsed.inputLanguage === "zh" ? "你需要先拿起笔才能写字。" : "You need to take the pen before writing.");
    }
    fact(registry, snapshots, conditions, `entity:${note.entityId}.inscription`, "", note.attributeRevisions.inscription ?? 0, ["", inscription]);
    fact(registry, snapshots, conditions, `relation:${noteLocation.relationId}.active`, "true", noteLocation.setAtSequence);
    fact(registry, snapshots, conditions, `relation:${penLocation.relationId}.active`, "true", penLocation.setAtSequence);
    const writeEventId = `event-write-${note.entityId}-${options.commitSequence}`;
    events.push({ eventId: writeEventId, type: "action_result", actionKind: "write", outcome: "success", subjectRef: "self", objectRef: note.entityId });
    commitments.push({ kind: "attribute_set", entityId: note.entityId, attribute: "inscription", value: inscription });
    if (pillow) {
      const placeEventId = `event-place-${note.entityId}-${options.commitSequence}`;
      events.push({ eventId: placeEventId, type: "action_result", actionKind: "place", outcome: "success", subjectRef: "self", objectRef: note.entityId });
      commitments.push(
        { kind: "relation_ended", relationId: noteLocation.relationId },
        { kind: "relation_asserted", relationId: `${note.entityId}-location-${options.commitSequence}`, subjectId: note.entityId, predicate: "contained_by", objectId: pillow.entityId },
      );
    }
    response = parsed.inputLanguage === "zh"
      ? (pillow ? `你在${label(note, "zh")}上写下“${inscription}”，把它放在${label(pillow, "zh")}下面。` : `你在${label(note, "zh")}上写下“${inscription}”。`)
      : (pillow ? `You write “${inscription}” on the ${label(note, "en")} and place it under the ${label(pillow, "en")}.` : `You write “${inscription}” on the ${label(note, "en")}.`);
  } else if (parsed.operation === "inspect_inscription_presence" || parsed.operation === "inspect_inscription_value") {
    const note = exactlyOne(mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.entityType === "paper_note"), "paper note");
    if (!isEntityPerceivable(world, note)) throw new ObjectTurnError(`${note.entityId} is not currently visible.`);
    const inscription = note.attributes.inscription ?? "";
    fact(registry, snapshots, conditions, `entity:${note.entityId}.inscription`, inscription, note.attributeRevisions.inscription ?? 0);
    const eventId = `event-inspect-inscription-${note.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: parsed.operation, outcome: "success", subjectRef: "self", objectRef: note.entityId });
    const evidenceId = `evidence-inscription-${note.entityId}-${options.commitSequence}`;
    evidenceGenerated.push({ evidenceId, kind: "attribute_observed", sourceEventId: eventId, subjectId: note.entityId, attribute: "inscription", value: inscription });
    epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    presentationItems.push({ kind: "attribute_evidence", semanticAddress: entityAttributeAddress(note.entityId, "inscription"), value: inscription, evidenceId });
    if (parsed.inputLanguage === "zh") response = inscription ? (parsed.operation === "inspect_inscription_presence" ? "纸条上有字。" : `纸条上写着“${inscription}”。`) : "纸条上没有字。";
    else response = inscription ? (parsed.operation === "inspect_inscription_presence" ? "There is writing on the note." : `The note reads “${inscription}”.`) : "There is no writing on the note.";
  } else if (parsed.operation === "read") {
    const mentionedPillow = mentionedIds.find((id) => world.entities.get(id)?.entityType === "pillow");
    const mentionedNotes = mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.entityType === "paper_note");
    const allNotes = [...world.entities.values()].filter((entity) => entity.entityType === "paper_note");
    const readableNotes = (mentionedPillow ? allNotes : mentionedNotes.length > 0 ? mentionedNotes : allNotes).filter((entity) => {
      const candidateLocation = world.directLocation(entity.entityId);
      return Boolean(entity.attributes.inscription) && (!mentionedPillow || candidateLocation?.objectId === mentionedPillow);
    });
    const note = exactlyOne(readableNotes, "readable paper note");
    const location = currentLocation(world, note);
    const inscription = note.attributes.inscription;
    if (!inscription) throw new ObjectTurnError(`${note.entityId} has no readable inscription.`);
    // Same observation-bandwidth rule as inspect_inscription_value, kept as a
    // thrown ObjectTurnError rather than a boundary because "read" is a
    // compound find-and-read action, not a queryKind-routed query, and its
    // existing failure idiom (e.g. "no readable inscription" above) already
    // throws (docs/MVP-observation-bandwidth-design-v0.8.md §3).
    if (world.entities.get("self")?.attributes.position !== "bedside") {
      throw new ObjectTurnError(parsed.inputLanguage === "zh" ? "你离得太远，看不清上面写的字。" : "You are too far away to make out what is written on it.");
    }
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    fact(registry, snapshots, conditions, `entity:${note.entityId}.inscription`, inscription, note.attributeRevisions.inscription ?? 0);
    const findEventId = `event-find-${note.entityId}-${options.commitSequence}`;
    const readEventId = `event-read-${note.entityId}-${options.commitSequence}`;
    events.push(
      { eventId: findEventId, type: "action_result", actionKind: "find", outcome: "success", subjectRef: "self", objectRef: note.entityId },
      { eventId: readEventId, type: "action_result", actionKind: "read", outcome: "success", subjectRef: "self", objectRef: note.entityId },
    );
    const locationEvidenceId = `evidence-location-${note.entityId}-${options.commitSequence}`;
    const inscriptionEvidenceId = `evidence-inscription-${note.entityId}-${options.commitSequence}`;
    evidenceGenerated.push(
      { evidenceId: locationEvidenceId, kind: "relation_observed", sourceEventId: findEventId, subjectId: note.entityId, predicate: location.predicate, objectId: location.objectId },
      { evidenceId: inscriptionEvidenceId, kind: "attribute_observed", sourceEventId: readEventId, subjectId: note.entityId, attribute: "inscription", value: inscription },
    );
    epistemicChanges.push(
      { agentId: "self", kind: "acquired_evidence", evidenceId: locationEvidenceId },
      { agentId: "self", kind: "acquired_evidence", evidenceId: inscriptionEvidenceId },
    );
    presentationItems.push(
      { kind: "relation_evidence", semanticAddress: relationSlotAddress(note.entityId, location.predicate), value: location.objectId, evidenceId: locationEvidenceId },
      { kind: "attribute_evidence", semanticAddress: entityAttributeAddress(note.entityId, "inscription"), value: inscription, evidenceId: inscriptionEvidenceId },
    );
    response = parsed.inputLanguage === "zh" ? `你在${location.objectId === "pillow-1" ? "枕头下面" : "那里"}找到${label(note, "zh")}。上面写着“${inscription}”。` : `You find the ${label(note, "en")} and read “${inscription}”.`;
  } else if (parsed.operation === "open_and_inspect") {
    const container = exactlyOne(candidatesByCapability(world, mentionedIds, "openable").filter((entity) => entity.attributes.container === "true"), "openable container");
    if (container.attributes.open_state === "closed") {
      fact(registry, snapshots, conditions, `entity:${container.entityId}.open_state`, "closed", container.attributeRevisions.open_state ?? 0, ["closed", "open"]);
      events.push({ eventId: `event-open-${container.entityId}-${options.commitSequence}`, type: "action_result", actionKind: "open", outcome: "success", subjectRef: "self", objectRef: container.entityId });
      commitments.push({ kind: "attribute_set", entityId: container.entityId, attribute: "open_state", value: "open" });
    } else if (container.attributes.open_state !== "open") {
      throw new ObjectTurnError(`${container.entityId} cannot be opened.`);
    }
    const contents = world.entitiesRelatedTo("contained_by", container.entityId);
    const inspectEventId = `event-inspect-${container.entityId}-${options.commitSequence}`;
    events.push({ eventId: inspectEventId, type: "action_result", actionKind: "inspect_contents", outcome: "success", subjectRef: "self", objectRef: container.entityId });
    for (const entity of contents) {
      const relation = world.directLocation(entity.entityId)!;
      fact(registry, snapshots, conditions, `relation:${relation.relationId}.active`, "true", relation.setAtSequence);
      const evidenceId = `evidence-content-${entity.entityId}-${options.commitSequence}`;
      evidenceGenerated.push({ evidenceId, kind: "relation_observed", sourceEventId: inspectEventId, subjectId: entity.entityId, predicate: "contained_by", objectId: container.entityId });
      epistemicChanges.push({ agentId: "self", kind: "acquired_evidence", evidenceId });
    }
    const names = contents.map((entity) => label(entity, parsed.inputLanguage));
    observations.push({ kind: "container_contents", containerId: container.entityId, entityIds: contents.map((entity) => entity.entityId) });
    completeRelationSet = { predicate: "contained_by", objectId: container.entityId, subjectIds: contents.map((entity) => entity.entityId), sourceEventId: inspectEventId };
    presentationItems.push({ kind: "bounded_relation_set", predicate: "contained_by", objectId: container.entityId, subjectIds: contents.map((entity) => entity.entityId), complete: true });
    response = parsed.inputLanguage === "zh"
      ? (names.length ? `你打开${label(container, "zh")}，看到里面有：${names.join("、")}。` : `你打开${label(container, "zh")}，看到里面是空的。`)
      : (names.length ? `You open the ${label(container, "en")} and see inside: ${names.join(", ")}.` : `You open the ${label(container, "en")} and see that it is empty.`);
  } else if (parsed.operation === "open_and_observe") {
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
    requireReachable(world, target, parsed.inputLanguage);
    const expected = parsed.operation === "open" ? "closed" : "open";
    const next = parsed.operation === "open" ? "open" : "closed";
    if (target.attributes.open_state !== expected) throw new ObjectTurnError(`${target.entityId} is not ${expected}.`);
    fact(registry, snapshots, conditions, `entity:${target.entityId}.open_state`, expected, target.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    const eventId = `event-${parsed.operation}-${target.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: parsed.operation, outcome: "success", subjectRef: "self", objectRef: target.entityId });
    commitments.push({ kind: "attribute_set", entityId: target.entityId, attribute: "open_state", value: next });
    response = parsed.inputLanguage === "zh" ? `你${parsed.operation === "open" ? "打开" : "关上"}了${label(target, "zh")}。` : `You ${parsed.operation} the ${label(target, "en")}.`;
  } else if (parsed.operation === "move") {
    const landmark = exactlyOne(
      mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity !== undefined && Object.hasOwn(MOVE_DESTINATIONS, entity.entityId)),
      "move destination",
    );
    const destination = MOVE_DESTINATIONS[landmark.entityId]!;
    const self = world.entities.get("self")!;
    const currentPosition = self.attributes.position as PositionValue | undefined;
    if (!currentPosition) throw new ObjectTurnError("self has no position.");
    const destinationLabel: Readonly<Record<PositionValue, { zh: string; en: string }>> = {
      bedside: { zh: "床边", en: "the bedside" }, doorway: { zh: "门口", en: "the doorway" },
      hallway: { zh: "走廊", en: "the hallway" }, living_room: { zh: "客厅", en: "the living room" },
    };
    if (currentPosition === destination) {
      throw new ObjectTurnError(parsed.inputLanguage === "zh" ? `你已经在${destinationLabel[destination].zh}了。` : `You are already at ${destinationLabel[destination].en}.`);
    }
    // Adjacency-table-driven, and checked in whichever direction is actually
    // being crossed — fixes a real bug the hallway-only version had: closing
    // the door from the hallway side used to leave the doorway/hallway edge
    // completely unchecked (only the bedroom->hallway direction was ever
    // gated), so you could still walk straight back through a closed door.
    const edge = PLACE_ADJACENCY[currentPosition].find((candidate) => candidate.to === destination);
    if (!edge) throw new ObjectTurnError(parsed.inputLanguage === "zh" ? "那里走不过去。" : "You can't walk there from here.");
    if (edge.requiresOpenDoor) {
      const door = world.entities.get(edge.requiresOpenDoor)!;
      fact(registry, snapshots, conditions, `entity:${edge.requiresOpenDoor}.open_state`, door.attributes.open_state ?? "closed", door.attributeRevisions.open_state ?? 0, ["closed", "open"]);
      if (door.attributes.open_state !== "open") {
        throw new ObjectTurnError(parsed.inputLanguage === "zh" ? "门还关着，你出不去。" : "The door is still closed; you can't go through.");
      }
    }
    fact(registry, snapshots, conditions, "entity:self.position", currentPosition, self.attributeRevisions.position ?? 0);
    const eventId = `event-move-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind: "move", outcome: "success", subjectRef: "self", objectRef: landmark.entityId });
    commitments.push({ kind: "attribute_set", entityId: "self", attribute: "position", value: destination });
    response = parsed.inputLanguage === "zh" ? `你走到了${destinationLabel[destination].zh}。` : `You walk to ${destinationLabel[destination].en}.`;
  } else if (parsed.operation === "take") {
    const object = exactlyOne(candidatesByCapability(world, mentionedIds, "portable"), "portable object");
    requireReachable(world, object, parsed.inputLanguage);
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
  } else if (parsed.operation === "place" || parsed.operation === "put_inside") {
    const object = exactlyOne(candidatesByCapability(world, mentionedIds, "portable"), "portable object");
    const destinationIds = mentionedIds.filter((id) => id !== object.entityId);
    const surfaces = destinationIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.attributes.surface === "true" || entity?.entityType === "bed");
    const containers = destinationIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity?.attributes.container === "true");
    const useContainer = parsed.operation === "put_inside" || parsed.placementRelation === "inside" || (surfaces.length === 0 && containers.length === 1);
    const destination = useContainer ? exactlyOne(containers, "container") : exactlyOne(surfaces, "surface");
    const location = currentLocation(world, object);
    if (location.predicate !== "held_by" || location.objectId !== "self") throw new ObjectTurnError(`${object.entityId} is not held by self.`);
    // object needs no separate reachability check: it is already confirmed
    // held_by self above, and isEntityPerceivable always treats a held item
    // as reachable wherever self stands. The destination is the only new gate.
    requireReachable(world, destination, parsed.inputLanguage);
    if (useContainer && destination.attributes.openable === "true" && destination.attributes.open_state !== "open") throw new ObjectTurnError(`${destination.entityId} is closed.`);
    fact(registry, snapshots, conditions, `relation:${location.relationId}.active`, "true", location.setAtSequence);
    if (useContainer && destination.attributes.openable === "true") fact(registry, snapshots, conditions, `entity:${destination.entityId}.open_state`, "open", destination.attributeRevisions.open_state ?? 0, ["closed", "open"]);
    const actionKind = useContainer ? "put_inside" : "place";
    const eventId = `event-${actionKind}-${object.entityId}-${options.commitSequence}`;
    events.push({ eventId, type: "action_result", actionKind, outcome: "success", subjectRef: "self", objectRef: object.entityId });
    commitments.push(
      { kind: "relation_ended", relationId: location.relationId },
      { kind: "relation_asserted", relationId: `${object.entityId}-location-${options.commitSequence}`, subjectId: object.entityId,
        predicate: useContainer ? "contained_by" : "located_on", objectId: destination.entityId },
    );
    response = parsed.inputLanguage === "zh" ? `你把${label(object, "zh")}${useContainer ? "放进了" : "放在"}${label(destination, "zh")}${useContainer ? "" : "上"}。`
      : `You ${useContainer ? "put" : "place"} the ${label(object, "en")} ${useContainer ? "into" : "on"} the ${label(destination, "en")}.`;
  } else {
    const visible = mentionedIds.map((id) => world.entities.get(id)).filter((entity): entity is MaterializedEntity => entity !== undefined);
    const target = exactlyOne(visible.filter((entity) => entity.entityType !== "person"), "observable object");
    const location = currentLocation(world, target);
    if (location.predicate === "contained_by") {
      const container = world.entities.get(location.objectId);
      if (container?.attributes.openable === "true" && container.attributes.open_state !== "open") throw new ObjectTurnError(`${container.entityId} is closed.`);
    }
    requireReachable(world, target, parsed.inputLanguage);
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
  const canonical = (queryKind || selfQuery || placeContentQuery || parsed.operation === "read") ? buildCanonicalQueryEnvelope({ turnId: options.turnId, commitSequence: options.commitSequence, language: parsed.inputLanguage,
    evidence: evidenceGenerated, presentationItems, ...(completeRelationSet ? { completeRelationSet } : {}) }) : undefined;
  const commitPackage = await commitCandidateEnvelope({ ...options, envelope, registry, snapshots, worldBasis: fixture.worldBasis, seedCommitments: fixture.seedCommitments, ...(canonical ? { canonical } : {}) });
  if (commitPackage.canonical) response = await queryRenderer.render(commitPackage.canonical.presentationPacket, options.rawTtd);
  return { kind: "committed", response, commitPackage, intent: parseMvpIntent(options.rawTtd) };
}

export function isObjectIntent(rawTtd: string): boolean {
  const parsed = parseObjectIntent(rawTtd);
  if (!parsed) return false;
  if (parsed.operation === "look_around" || parsed.operation === "inventory") return true;
  const ids = resolveFixtureEntity(createObjectWorldFixture(), rawTtd);
  return ids.length > 0;
}
