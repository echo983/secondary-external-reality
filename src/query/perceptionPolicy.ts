import { MaterializedWorld, type MaterializedEntity } from "../world/materializedWorld.js";

export type PerceptionPathDecision =
  | { allowed: true }
  | { allowed: false; code: "TARGET_NOT_PERCEIVABLE" | "CONTAINER_CLOSED" };

// Furniture with no direct location relation (nothing places it "on"/"in"
// anything) that is nonetheless only visible from one side of the door.
// door-1 is deliberately excluded — a door is visible from either room.
const ROOM_SCOPED_ENTITIES: Readonly<Record<string, "bedroom" | "hallway">> = {
  "bed-1": "bedroom", "nightstand-1": "bedroom", "drawer-1": "bedroom", "table-1": "bedroom",
  "hallway-1": "hallway",
};

export function isEntityPerceivable(world: MaterializedWorld, entity: MaterializedEntity, visited = new Set<string>()): boolean {
  const room = ROOM_SCOPED_ENTITIES[entity.entityId];
  if (room) {
    const selfRoom = world.entities.get("self")?.attributes.position === "hallway" ? "hallway" : "bedroom";
    // hallway-1 itself is a special case: you can see into it from the bedroom
    // side through an open door without having stepped through yet.
    const doorOpenException = entity.entityId === "hallway-1" && world.entities.get("door-1")?.attributes.open_state === "open";
    if (room !== selfRoom && !doorOpenException) return false;
  }
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
