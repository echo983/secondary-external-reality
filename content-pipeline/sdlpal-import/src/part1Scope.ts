// Finalized scope for the first content pack: one scene per named Part1
// location (starting village + Immortal Spirit Island, before the ship
// departs). Where a map was revisited by later story chapters (scene
// numbering isn't chronological — see FORMAT-NOTES.md), the first-occurring
// scene is picked as the seed snapshot. This is a pragmatic choice, not a
// claim about canonical story order: this world doesn't replay the original
// plot, so "a reasonable snapshot" is good enough — no need to verify which
// occurrence was narratively "first." Gaps (an unnamed or missing location)
// get patched with a direct hand-authored adjacency edge later rather than
// blocking on finding more source data.

import { extractScenes, eventObjectRangeForScene, type Scene } from "./scenes.ts";
import { extractEventObjects, type EventObject } from "./eventObjects.ts";
import { PART1_MAP_NAMES } from "./part1MapNames.ts";

export interface Part1LocationScope {
  mapNum: number;
  name: string;
  sceneIndex: number;
  eventObjectRange: { start: number; end: number };
}

export function resolvePart1Scope(sssPath: string): { locations: Part1LocationScope[]; scenes: Scene[]; eventObjects: EventObject[] } {
  const scenes = extractScenes(sssPath);
  const eventObjects = extractEventObjects(sssPath);
  const locations: Part1LocationScope[] = [];
  for (const [mapNumStr, name] of Object.entries(PART1_MAP_NAMES)) {
    const mapNum = Number(mapNumStr);
    const candidates = scenes.filter((s) => s.index >= 1 && s.mapNum === mapNum);
    if (candidates.length === 0) continue; // gap — patch with a hand-authored place later, don't block
    const first = candidates.reduce((a, b) => (a.index < b.index ? a : b));
    locations.push({ mapNum, name, sceneIndex: first.index, eventObjectRange: eventObjectRangeForScene(scenes, first.index) });
  }
  return { locations, scenes, eventObjects };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? "game-data/SSS.MKF";
  const { locations, eventObjects } = resolvePart1Scope(path);
  console.log(`resolved ${locations.length} of ${Object.keys(PART1_MAP_NAMES).length} named Part1 locations to a scene\n`);
  for (const loc of locations) {
    const nonHidden = eventObjects.slice(loc.eventObjectRange.start, loc.eventObjectRange.end).filter((o) => o.state !== 0).length;
    console.log(`${loc.name} (map ${loc.mapNum}, scene ${loc.sceneIndex}): ${loc.eventObjectRange.end - loc.eventObjectRange.start} event objects, ${nonHidden} non-hidden`);
  }
  const missing = Object.entries(PART1_MAP_NAMES).filter(([mapNumStr]) => !locations.some((l) => l.mapNum === Number(mapNumStr)));
  if (missing.length > 0) console.log(`\nno scene found for: ${missing.map(([n, name]) => `${name}(map ${n})`).join(", ")}`);
}
