// CLI: node src/extractScenes.ts [path-to-SSS.MKF]
// Exploratory tooling, not a formal test — see ../README.md.

import { extractScenes, eventObjectRangeForScene } from "./scenes.ts";
import { extractEventObjects } from "./eventObjects.ts";

const path = process.argv[2] ?? "game-data/SSS.MKF";
const scenes = extractScenes(path);
const eventObjects = extractEventObjects(path);

console.log(`total scene slots: ${scenes.length}`);
const realScenes = scenes.filter((s, i) => i >= 1 && s.mapNum !== 0);
console.log(`scenes with a non-zero map number: ${realScenes.length}`);

// Sanity check: prefix-sum boundaries must be non-decreasing and never
// exceed the actual event object count, or the range formula from scene.c
// is being misapplied.
let monotonic = true;
for (let i = 1; i < scenes.length; i += 1) {
  if (scenes[i]!.eventObjectIndex < scenes[i - 1]!.eventObjectIndex) { monotonic = false; break; }
}
const maxIndex = Math.max(...scenes.map((s) => s.eventObjectIndex));
console.log(`eventObjectIndex monotonically non-decreasing across all slots: ${monotonic}`);
console.log(`max eventObjectIndex: ${maxIndex}, actual event object count: ${eventObjects.length}`);

console.log("\nfirst 10 real scenes (map number, event object range, count):");
for (const scene of realScenes.slice(0, 10)) {
  const range = eventObjectRangeForScene(scenes, scene.index);
  console.log(`  scene ${scene.index}: map=${scene.mapNum} events=[${range.start},${range.end}) count=${range.end - range.start}`);
}

const distinctMaps = new Set(realScenes.map((s) => s.mapNum));
console.log(`\ndistinct map numbers referenced by scenes: ${distinctMaps.size}`);
