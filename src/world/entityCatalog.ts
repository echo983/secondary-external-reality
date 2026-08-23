import { MaterializedWorld, type MaterializedEntity } from "./materializedWorld.js";
import type { ObjectOperationKind } from "./objectIntent.js";
import type { ObjectWorldFixture } from "./objectFixture.js";

export interface EntityCatalogEntry {
  entityId: string;
  entityType: string;
  names: readonly string[];
  attributes: Readonly<Record<string, string>>;
}

export class EntityCatalog {
  readonly entries: readonly EntityCatalogEntry[];

  constructor(fixture: ObjectWorldFixture) {
    const world = MaterializedWorld.replay([], fixture.seedCommitments);
    this.entries = [...world.entities.values()].map((entity) => ({
      entityId: entity.entityId, entityType: entity.entityType,
      names: fixture.names.find((item) => item.entityId === entity.entityId)?.names ?? [],
      attributes: structuredClone(entity.attributes),
    })).sort((left, right) => left.entityId.localeCompare(right.entityId));
  }
}

export function availableAffordances(entity: MaterializedEntity, world: MaterializedWorld): ObjectOperationKind[] {
  const actions: ObjectOperationKind[] = ["observe", "locate"];
  if (entity.attributes.openable === "true") actions.push(entity.attributes.open_state === "open" ? "close" : "open");
  if (entity.attributes.container === "true" && (entity.attributes.openable !== "true" || entity.attributes.open_state === "open")) actions.push("inspect_contents");
  if (entity.attributes.portable === "true") {
    const location = world.directLocation(entity.entityId);
    if (location?.predicate === "held_by" && location.objectId === "self") actions.push("place", "put_inside");
    else actions.push("take");
  }
  if (entity.entityType === "paper_note" && entity.attributes.inscription) actions.push("read");
  return [...new Set(actions)];
}
