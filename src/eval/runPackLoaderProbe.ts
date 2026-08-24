// Stage-2 pack-loader probe verification
// (docs/STATUS-four-stage-maturity-assessment-v1.0.md §6).
//
// Not a live-eval gate suite (no LLM involved) — a one-off check that the
// real sdlpal-derived .pack file (content-pipeline/sdlpal-import/output/
// part1-authored.pack, gitignored, generated on the separate
// content-pipeline/sdlpal-import branch but still physically present on
// disk) survives loadPackAsSeedCommitments() and MaterializedWorld.replay()
// without throwing. Run with: npm run build && node dist/src/eval/runPackLoaderProbe.js

import { readFileSync } from "node:fs";
import { loadPackAsSeedCommitments } from "../world/packLoader.js";
import { MaterializedWorld } from "../world/materializedWorld.js";

const PACK_PATH = "content-pipeline/sdlpal-import/output/part1-authored.pack";

function main(): void {
  const text = readFileSync(PACK_PATH, "utf8");
  const { seedCommitments, errors, placeCount, entityCount } = loadPackAsSeedCommitments(text);

  console.log(`parsed pack: ${placeCount} places, ${entityCount} entities, ${errors.length} parse errors`);
  if (errors.length > 0) {
    for (const error of errors.slice(0, 10)) console.log(`  parse error at line ${error.line}: ${error.message}`);
  }

  const world = MaterializedWorld.replay([], seedCommitments);
  console.log(`replay succeeded: ${world.entities.size} entities materialized, ${world.relations.size} relations materialized`);

  const expectedEntities = placeCount + entityCount;
  if (world.entities.size !== expectedEntities) {
    throw new Error(`expected ${expectedEntities} materialized entities, got ${world.entities.size}`);
  }

  console.log("PROBE OK");
}

main();
