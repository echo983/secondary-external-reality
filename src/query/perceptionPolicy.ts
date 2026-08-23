import { MaterializedWorld, type MaterializedEntity } from "../world/materializedWorld.js";

export type PerceptionPathDecision =
  | { allowed: true }
  | { allowed: false; code: "TARGET_NOT_PERCEIVABLE" | "CONTAINER_CLOSED" };

export function isEntityPerceivable(world: MaterializedWorld, entity: MaterializedEntity, visited = new Set<string>()): boolean {
  if (visited.has(entity.entityId)) return false;
  const nextVisited = new Set(visited).add(entity.entityId);
  const location = world.directLocation(entity.entityId);
  if (!location) return entity.entityType !== "person";
  if (location.predicate === "held_by") return location.objectId === "self";
  const parent = world.entities.get(location.objectId);
  if (!parent || !isEntityPerceivable(world, parent, nextVisited)) return false;
  return location.predicate !== "contained_by" || parent.attributes.open_state === "open";
}

export function mayInspectContents(world: MaterializedWorld, container: MaterializedEntity): PerceptionPathDecision {
  if (!isEntityPerceivable(world, container)) return { allowed: false, code: "TARGET_NOT_PERCEIVABLE" };
  if (container.attributes.openable === "true" && container.attributes.open_state !== "open") return { allowed: false, code: "CONTAINER_CLOSED" };
  return { allowed: true };
}
