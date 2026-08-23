const TOKEN = "[a-z0-9_-]+";
const ENTITY_ATTRIBUTE = new RegExp(`^entity:(${TOKEN})\\.attribute:(${TOKEN})$`, "u");
const RELATION_ACTIVE = new RegExp(`^relation:(${TOKEN})\\.active$`, "u");
const RELATION_SLOT = new RegExp(`^relation-slot:(${TOKEN})\\.(${TOKEN})$`, "u");
const LEGACY_ENTITY = new RegExp(`^entity:(${TOKEN})\\.(${TOKEN})$`, "u");
const LEGACY_ACTION_OUTCOME = new RegExp(`^entity:(${TOKEN})\\.action_outcome\\.(${TOKEN})$`, "u");

declare const semanticAddressBrand: unique symbol;
export type SemanticAddress = string & { readonly [semanticAddressBrand]: true };

export type ParsedSemanticAddress =
  | { kind: "entity_attribute"; entityId: string; attribute: string }
  | { kind: "relation_active"; relationId: string }
  | { kind: "relation_slot"; subjectId: string; predicate: string };

export type LegacyAddressClassification =
  | "mutable_state_snapshot"
  | "action_resolution"
  | "unclassified";

export interface LegacyAddressUpgrade {
  sourceAddress: string;
  canonicalAddress?: SemanticAddress;
  classification: LegacyAddressClassification;
}

export class SemanticAddressError extends Error {
  constructor(readonly code: "INVALID_SEMANTIC_ADDRESS" | "INVALID_SEMANTIC_TOKEN", message: string) {
    super(message);
    this.name = "SemanticAddressError";
  }
}

function token(value: string, label: string): string {
  if (!new RegExp(`^${TOKEN}$`, "u").test(value)) {
    throw new SemanticAddressError("INVALID_SEMANTIC_TOKEN", `${label} is not a canonical semantic token.`);
  }
  return value;
}

export function entityAttributeAddress(entityId: string, attribute: string): SemanticAddress {
  return `entity:${token(entityId, "entityId")}.attribute:${token(attribute, "attribute")}` as SemanticAddress;
}

export function relationActiveAddress(relationId: string): SemanticAddress {
  return `relation:${token(relationId, "relationId")}.active` as SemanticAddress;
}

export function relationSlotAddress(subjectId: string, predicate: string): SemanticAddress {
  return `relation-slot:${token(subjectId, "subjectId")}.${token(predicate, "predicate")}` as SemanticAddress;
}

export function parseSemanticAddress(value: string): ParsedSemanticAddress {
  let match = ENTITY_ATTRIBUTE.exec(value);
  if (match) return { kind: "entity_attribute", entityId: match[1]!, attribute: match[2]! };
  match = RELATION_ACTIVE.exec(value);
  if (match) return { kind: "relation_active", relationId: match[1]! };
  match = RELATION_SLOT.exec(value);
  if (match) return { kind: "relation_slot", subjectId: match[1]!, predicate: match[2]! };
  throw new SemanticAddressError("INVALID_SEMANTIC_ADDRESS", "Address is not in the canonical semantic grammar.");
}

export function canonicalSemanticAddress(value: string): SemanticAddress {
  const parsed = parseSemanticAddress(value);
  if (parsed.kind === "entity_attribute") return entityAttributeAddress(parsed.entityId, parsed.attribute);
  if (parsed.kind === "relation_active") return relationActiveAddress(parsed.relationId);
  return relationSlotAddress(parsed.subjectId, parsed.predicate);
}

export function tryUpgradeLegacyAddress(sourceAddress: string): LegacyAddressUpgrade {
  const action = LEGACY_ACTION_OUTCOME.exec(sourceAddress);
  if (action) return { sourceAddress, classification: "action_resolution" };
  const entity = LEGACY_ENTITY.exec(sourceAddress);
  if (entity) {
    return {
      sourceAddress,
      canonicalAddress: entityAttributeAddress(entity[1]!, entity[2]!),
      classification: "mutable_state_snapshot",
    };
  }
  try {
    return { sourceAddress, canonicalAddress: canonicalSemanticAddress(sourceAddress), classification: "mutable_state_snapshot" };
  } catch {
    return { sourceAddress, classification: "unclassified" };
  }
}
