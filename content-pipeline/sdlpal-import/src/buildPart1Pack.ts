// CLI: node src/buildPart1Pack.ts [path-to-SSS.MKF] [output-path]
// Converts the resolved Part1 scope (part1Scope.ts) into a v0.1 content
// pack (content-pipeline/pack-format/SPEC-v0.1.md).
//
// What this converter is honest about: sdlpal's data gives us position,
// sprite number, trigger mode, and state for each event object — NOT names,
// NOT personalities, NOT a person/prop classification (that would need a
// GOP.MKF sprite catalog we haven't built). So entities come out with a
// deliberately generic type and no narrative body rather than an invented
// name — fabricating identity for something we don't actually know would
// defeat the point of a "faithful extraction" step. Naming/typing/writing
// personality seeds is separate, later, explicitly-authored work.
//
// Place adjacency is NOT extracted from game data (that lives in script
// logic we're not parsing) — it's a small hand-authored topology based on
// the location names alone ("拓扑飞线"), noted inline below.

import type { PackRecord } from "../../pack-format/src/parser.ts";
import { serializePack } from "../../pack-format/src/serializer.ts";
import { resolvePart1Scope } from "./part1Scope.ts";

const sssPath = process.argv[2] ?? "game-data/SSS.MKF";
const outPath = process.argv[3] ?? "output/part1.pack";

const { locations, eventObjects } = resolvePart1Scope(sssPath);
const byMapNum = new Map(locations.map((loc) => [loc.mapNum, loc]));

// map number -> place id, and the merge of 莲花池/莲花池（破阵）(17/18) into
// one physical place, keeping map 18's richer event-object snapshot (16
// non-hidden objects vs map 17's 4) as the seed content for it.
const PLACE_ID: Record<number, string> = {
  1: "inn-room", 2: "aunt-room", 3: "inn", 4: "village", 5: "market",
  7: "temple-outside", 8: "house-1", 9: "house-2", 10: "pharmacy", 11: "temple-inside",
  12: "blacksmith", 13: "carpenter", 14: "spirit-pool", 15: "island-dock",
  18: "lotus-pool", // map 17 (same place, thinner snapshot) intentionally dropped
  19: "palace-outside", 20: "palace",
};

// Hand-authored, not extracted — a plausible tree matching the location
// names (village core + its rooms/shops, a short boat crossing to the
// island, the island's own three sub-areas). Edges are undirected; each
// listed once, both directions understood.
const ADJACENCY: Array<[string, string]> = [
  ["village", "inn"], ["inn", "inn-room"], ["inn", "aunt-room"],
  ["village", "market"], ["village", "house-1"], ["village", "house-2"],
  ["village", "pharmacy"], ["village", "blacksmith"], ["village", "carpenter"],
  ["village", "temple-outside"], ["temple-outside", "temple-inside"],
  ["village", "island-dock"], // short boat crossing — still in scope, not "the big ship"
  ["island-dock", "spirit-pool"], ["island-dock", "lotus-pool"], ["island-dock", "palace-outside"],
  ["palace-outside", "palace"],
];

const records: PackRecord[] = [];

for (const [mapNumStr, placeId] of Object.entries(PLACE_ID)) {
  const mapNum = Number(mapNumStr);
  const loc = byMapNum.get(mapNum);
  if (!loc) continue; // gap — see part1Scope.ts; none expected this run
  const adjacent = ADJACENCY.filter(([a, b]) => a === placeId || b === placeId).map(([a, b]) => (a === placeId ? b : a));
  const fields: Record<string, string[]> = { id: [placeId], zh: [loc.name], adjacent };
  records.push({ recordType: "place", startLine: 0, fields });

  const objects = eventObjects.slice(loc.eventObjectRange.start, loc.eventObjectRange.end).filter((o) => o.state !== 0);
  for (const obj of objects) {
    records.push({
      recordType: "entity",
      startLine: 0,
      fields: {
        id: [`${placeId}-obj-${obj.index}`],
        type: ["unidentified_object"],
        place: [placeId],
        attrs: [`sprite=${obj.spriteNum} trigger_mode=${obj.triggerMode} state=${obj.state}`],
      },
    });
  }
}

const text = serializePack(records);
const { mkdir, writeFile } = await import("node:fs/promises");
const { dirname } = await import("node:path");
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text, "utf8");

const placeCount = records.filter((r) => r.recordType === "place").length;
const entityCount = records.filter((r) => r.recordType === "entity").length;
console.log(`wrote ${outPath}: ${placeCount} places, ${entityCount} entities`);
