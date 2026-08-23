import { createHash } from "node:crypto";
import type { WorldCommitment } from "../protocol/types.js";
import type { WorldBasis } from "../protocol/types.js";
import { ReferenceLexicon } from "./referenceLexicon.js";

export interface FixtureEntityName {
  entityId: string;
  names: readonly string[];
}

export interface ObjectWorldFixture {
  seedCommitments: WorldCommitment[];
  names: FixtureEntityName[];
  worldBasis: WorldBasis;
}

export function createObjectWorldFixture(): ObjectWorldFixture {
  const entities: Array<{ id: string; type: string; names: string[]; attributes?: Record<string, string> }> = [
    { id: "self", type: "person", names: ["我", "自己", "self", "me", "I"], attributes: { posture: "sitting_on_bed_edge", position: "bedside" } },
    { id: "bed-1", type: "bed", names: ["床", "bed", "床边", "bedside"] },
    { id: "pillow-1", type: "pillow", names: ["枕头", "pillow"], attributes: { zh_name: "枕头", en_name: "pillow" } },
    { id: "nightstand-1", type: "nightstand", names: ["床头柜", "nightstand"], attributes: { surface: "true", zh_name: "床头柜", en_name: "nightstand" } },
    { id: "drawer-1", type: "drawer", names: ["抽屉", "drawer"], attributes: { container: "true", openable: "true", open_state: "closed", zh_name: "抽屉", en_name: "drawer" } },
    { id: "table-1", type: "table", names: ["桌子", "桌上", "table"], attributes: { surface: "true", zh_name: "桌子", en_name: "table" } },
    { id: "key-1", type: "key", names: ["钥匙", "key"], attributes: { portable: "true", zh_name: "钥匙", en_name: "key" } },
    { id: "blank-note-1", type: "paper_note", names: ["空白纸条", "空白便签", "纸条", "便签", "便签纸", "note", "sticky note"], attributes: { portable: "true", inscription: "", zh_name: "纸条", en_name: "note" } },
    { id: "pen-1", type: "pen", names: ["笔", "pen"], attributes: { portable: "true", zh_name: "笔", en_name: "pen" } },
    { id: "door-1", type: "door", names: ["门", "door", "门口", "doorway"], attributes: { openable: "true", open_state: "closed" } },
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
  const worldBasis: WorldBasis = {
    fixtureId: "mvp-bedroom-objects",
    fixtureVersion: "0.3.0",
    seedHash: createHash("sha256").update(JSON.stringify(seedCommitments)).digest("hex"),
  };
  return { seedCommitments, names: entities.map((entity) => ({ entityId: entity.id, names: entity.names })), worldBasis };
}

export function resolveFixtureEntity(fixture: ObjectWorldFixture, reference: string): string[] {
  return new ReferenceLexicon(fixture).resolveMention(reference);
}
