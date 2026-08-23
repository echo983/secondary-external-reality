import type { WorldCommitment } from "../protocol/types.js";

export class WorldSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldSchemaError";
  }
}

const attributesByType: Readonly<Record<string, ReadonlySet<string>>> = {
  person: new Set(["posture", "position", "zh_name", "en_name"]),
  bed: new Set(["zh_name", "en_name"]),
  pillow: new Set(["zh_name", "en_name"]),
  nightstand: new Set(["surface", "zh_name", "en_name"]),
  drawer: new Set(["container", "openable", "open_state", "zh_name", "en_name"]),
  table: new Set(["surface", "zh_name", "en_name"]),
  key: new Set(["portable", "zh_name", "en_name"]),
  paper_note: new Set(["portable", "inscription", "zh_name", "en_name"]),
  pen: new Set(["portable", "zh_name", "en_name"]),
  door: new Set(["openable", "open_state", "zh_name", "en_name"]),
  container: new Set(["container", "openable", "open_state", "portable", "zh_name", "en_name"]),
  place: new Set(["notable_feature", "zh_name", "en_name"]),
};

export const HALLWAY_NOTABLE_FEATURES = ["none", "framed_photo", "umbrella_stand", "wall_lamp"] as const;
export const LIVING_ROOM_NOTABLE_FEATURES = ["none", "bookshelf", "floor_lamp", "framed_painting"] as const;
// notable_feature is validated against the union of every place's value
// domain, not per-instance — schema validates "is this a plausible value for
// this attribute at all", the same way it doesn't check that a posture value
// logically follows from a position value. Each place's own resolver
// (resolvePlaceNotableFeature) is what guarantees a given entity only ever
// gets a value from its own domain.
const PLACE_NOTABLE_FEATURES = new Set<string>([...HALLWAY_NOTABLE_FEATURES, ...LIVING_ROOM_NOTABLE_FEATURES]);

const predicates = new Set(["located_on", "contained_by", "held_by", "part_of"]);
const booleanAttributes = new Set(["surface", "container", "openable", "portable"]);

export function validateEntityType(entityType: string): void {
  if (!Object.hasOwn(attributesByType, entityType)) throw new WorldSchemaError(`Unknown entity type ${entityType}.`);
}

export function validateAttribute(entityType: string, attribute: string, value: string): void {
  const allowed = attributesByType[entityType];
  if (!allowed?.has(attribute)) throw new WorldSchemaError(`Attribute ${attribute} is not defined for ${entityType}.`);
  if (booleanAttributes.has(attribute) && value !== "true" && value !== "false") {
    throw new WorldSchemaError(`Attribute ${attribute} requires a boolean string.`);
  }
  if (attribute === "open_state" && value !== "open" && value !== "closed") {
    throw new WorldSchemaError("open_state must be open or closed.");
  }
  if (attribute === "posture" && !["sitting_on_bed_edge", "standing"].includes(value)) {
    throw new WorldSchemaError(`Unsupported posture ${value}.`);
  }
  if (attribute === "position" && !["bedside", "doorway", "hallway", "living_room"].includes(value)) {
    throw new WorldSchemaError(`Unsupported position ${value}.`);
  }
  if (attribute === "notable_feature" && !PLACE_NOTABLE_FEATURES.has(value)) {
    throw new WorldSchemaError(`Unsupported notable_feature ${value}.`);
  }
  if (attribute === "inscription" && value !== "" && !/^[0-9]{1,64}$/u.test(value)) {
    throw new WorldSchemaError("MVP inscriptions must contain 1–64 digits.");
  }
}

export function validatePredicate(predicate: string): void {
  if (!predicates.has(predicate)) throw new WorldSchemaError(`Unknown relation predicate ${predicate}.`);
}

export function validateCommitmentSchema(commitment: WorldCommitment, entityType: (entityId: string) => string | undefined): void {
  if (commitment.kind === "entity_created") return validateEntityType(commitment.entityType);
  if (commitment.kind === "attribute_set") {
    const type = entityType(commitment.entityId);
    if (!type) throw new WorldSchemaError(`Attribute references missing entity ${commitment.entityId}.`);
    return validateAttribute(type, commitment.attribute, commitment.value);
  }
  if (commitment.kind === "relation_ended") return;
  validatePredicate(commitment.predicate);
}
