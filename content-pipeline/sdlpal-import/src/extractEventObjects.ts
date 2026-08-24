// CLI: node --experimental-strip-types src/extractEventObjects.ts [path-to-SSS.MKF]
// Reports basic stats on the extracted EventObject roster as a sanity check
// (this is exploratory tooling, not a formal test — see ../README.md).

import { extractEventObjects, OBJECT_STATE_NAMES, TRIGGER_MODE_NAMES } from "./eventObjects.ts";

const path = process.argv[2] ?? "game-data/SSS.MKF";
const objects = extractEventObjects(path);

const byState = new Map<number, number>();
const byTriggerMode = new Map<number, number>();
let mapNumBoundedX = 0;
for (const obj of objects) {
  byState.set(obj.state, (byState.get(obj.state) ?? 0) + 1);
  byTriggerMode.set(obj.triggerMode, (byTriggerMode.get(obj.triggerMode) ?? 0) + 1);
  if (obj.x > 0 && obj.x < 4096) mapNumBoundedX += 1;
}

console.log(`total event objects: ${objects.length}`);
console.log("by state:", [...byState.entries()].map(([k, v]) => `${OBJECT_STATE_NAMES[k] ?? k}=${v}`).join(", "));
console.log("by triggerMode:", [...byTriggerMode.entries()].map(([k, v]) => `${TRIGGER_MODE_NAMES[k] ?? k}=${v}`).join(", "));
console.log(`objects with plausible x coordinate (0 < x < 4096): ${mapNumBoundedX}`);
console.log("\nfirst 10 non-hidden objects:");
for (const obj of objects.filter((o) => o.state !== 0).slice(0, 10)) {
  console.log(JSON.stringify(obj));
}
