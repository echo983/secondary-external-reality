// CLI: node src/locatePart1Scenes.ts [path-to-SSS.MKF]
// Cross-references the Part1 (village + Immortal Spirit Island) map-name
// table against our own extracted Scene table, to pin down exactly which
// scene numbers belong to this chapter. Exploratory tooling — see ../README.md.

import { extractScenes, eventObjectRangeForScene } from "./scenes.ts";
import { extractEventObjects } from "./eventObjects.ts";
import { PART1_MAP_NAMES } from "./part1MapNames.ts";

const path = process.argv[2] ?? "game-data/SSS.MKF";
const scenes = extractScenes(path);
const eventObjects = extractEventObjects(path);

const matches = scenes.filter((s) => s.index >= 1 && Object.hasOwn(PART1_MAP_NAMES, s.mapNum));

console.log(`Part1 map numbers known: ${Object.keys(PART1_MAP_NAMES).length}`);
console.log(`matching scenes found: ${matches.length}\n`);

let totalEvents = 0;
for (const scene of matches) {
  const range = eventObjectRangeForScene(scenes, scene.index);
  const nonHidden = eventObjects.slice(range.start, range.end).filter((o) => o.state !== 0).length;
  totalEvents += range.end - range.start;
  console.log(`scene ${scene.index}: map=${scene.mapNum} (${PART1_MAP_NAMES[scene.mapNum]}) events=[${range.start},${range.end}) count=${range.end - range.start} nonHidden=${nonHidden}`);
}
console.log(`\ntotal event objects across all Part1 scenes: ${totalEvents}`);

const unmatchedMapNumbers = Object.keys(PART1_MAP_NAMES).map(Number).filter((mapNum) => !matches.some((s) => s.mapNum === mapNum));
if (unmatchedMapNumbers.length > 0) {
  console.log(`\nPart1 map numbers with NO matching scene (name known but no scene references it): ${unmatchedMapNumbers.join(", ")}`);
}
