import { MaterializedWorld, type MaterializedEntity } from "../world/materializedWorld.js";

export type PerceptionPathDecision =
  | { allowed: true }
  | { allowed: false; code: "TARGET_NOT_PERCEIVABLE" | "CONTAINER_CLOSED" };

export type RoomValue = "bedroom" | "hallway" | "living_room";

export function roomForPosition(position: string | undefined): RoomValue {
  return position === "hallway" ? "hallway" : position === "living_room" ? "living_room" : "bedroom";
}

// Furniture with no direct location relation (nothing places it "on"/"in"
// anything) that is nonetheless only visible from one side of a room
// boundary. door-1 is deliberately excluded — a door is visible from either
// room.
const ROOM_SCOPED_ENTITIES: Readonly<Record<string, RoomValue>> = {
  "bed-1": "bedroom", "nightstand-1": "bedroom", "drawer-1": "bedroom", "table-1": "bedroom",
  "hallway-1": "hallway", "living-room-1": "living_room",
};

// A place can be perceivable one room "back" along the chain even before
// self has stepped into it — hallway-1 from the bedroom side through an open
// door, living-room-1 from the hallway side through the doorless walkway
// (no requiresOpenDoor: that edge has no gate at all, so the exception
// always applies). Deliberately one hop only — no transitive/multi-hop
// visibility (docs/MVP-living-room-placegraph-design-v0.5.md §4).
export interface PlaceVisibilityException { fromRoom: RoomValue; requiresOpenDoor?: string }
export const PLACE_VISIBILITY_EXCEPTIONS: Readonly<Record<string, PlaceVisibilityException>> = {
  "hallway-1": { fromRoom: "bedroom", requiresOpenDoor: "door-1" },
  "living-room-1": { fromRoom: "hallway" },
};

export function isEntityPerceivable(world: MaterializedWorld, entity: MaterializedEntity, visited = new Set<string>()): boolean {
  const room = ROOM_SCOPED_ENTITIES[entity.entityId];
  if (room) {
    const selfRoom = roomForPosition(world.entities.get("self")?.attributes.position);
    const exception = PLACE_VISIBILITY_EXCEPTIONS[entity.entityId];
    const exceptionApplies = exception?.fromRoom === selfRoom
      && (!exception.requiresOpenDoor || world.entities.get(exception.requiresOpenDoor)?.attributes.open_state === "open");
    if (room !== selfRoom && !exceptionApplies) return false;
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
