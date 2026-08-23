import type { WorldCommitment } from "../protocol/types.js";

export interface FixtureEntityName {
  entityId: string;
  names: readonly string[];
}

export interface ObjectWorldFixture {
  seedCommitments: WorldCommitment[];
  names: FixtureEntityName[];
}

export function createObjectWorldFixture(): ObjectWorldFixture {
  const entities: Array<{ id: string; type: string; names: string[]; attributes?: Record<string, string> }> = [
    { id: "self", type: "person", names: ["我", "自己", "self", "me"] },
    { id: "bed-1", type: "bed", names: ["床", "bed"] },
    { id: "pillow-1", type: "pillow", names: ["枕头", "pillow"] },
    { id: "nightstand-1", type: "nightstand", names: ["床头柜", "nightstand"] },
    { id: "drawer-1", type: "drawer", names: ["抽屉", "drawer"], attributes: { container: "true", openable: "true", open_state: "closed" } },
    { id: "table-1", type: "table", names: ["桌子", "桌上", "table"] },
    { id: "key-1", type: "key", names: ["钥匙", "key"], attributes: { portable: "true" } },
    { id: "blank-note-1", type: "paper_note", names: ["空白纸条", "纸条", "note"], attributes: { portable: "true", inscription: "" } },
    { id: "pen-1", type: "pen", names: ["笔", "pen"], attributes: { portable: "true" } },
    { id: "door-1", type: "door", names: ["门", "door"], attributes: { openable: "true", open_state: "closed" } },
  ];
  const seedCommitments: WorldCommitment[] = [];
  for (const entity of entities) {
    seedCommitments.push({ kind: "entity_created", entityId: entity.id, entityType: entity.type });
    for (const [attribute, value] of Object.entries(entity.attributes ?? {})) {
      seedCommitments.push({ kind: "attribute_set", entityId: entity.id, attribute, value });
    }
  }
  seedCommitments.push(
    { kind: "relation_asserted", relationId: "seed-key-location", subjectId: "key-1", predicate: "located_on", objectId: "table-1" },
    { kind: "relation_asserted", relationId: "seed-note-location", subjectId: "blank-note-1", predicate: "located_on", objectId: "nightstand-1" },
    { kind: "relation_asserted", relationId: "seed-pen-location", subjectId: "pen-1", predicate: "located_on", objectId: "nightstand-1" },
    { kind: "relation_asserted", relationId: "seed-drawer-part", subjectId: "drawer-1", predicate: "part_of", objectId: "nightstand-1" },
    { kind: "relation_asserted", relationId: "seed-pillow-location", subjectId: "pillow-1", predicate: "located_on", objectId: "bed-1" },
  );
  return { seedCommitments, names: entities.map((entity) => ({ entityId: entity.id, names: entity.names })) };
}

export function resolveFixtureEntity(fixture: ObjectWorldFixture, reference: string): string[] {
  const normalized = reference.trim().toLocaleLowerCase();
  return fixture.names
    .filter((entry) => entry.names.some((name) => normalized.includes(name.toLocaleLowerCase())))
    .map((entry) => entry.entityId)
    .sort();
}
