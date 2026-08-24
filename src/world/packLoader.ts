// Stage-2 pack-loader probe (docs/STATUS-four-stage-maturity-assessment-v1.0.md
// §6) — the first code path that turns externally-sourced content (a v0.1
// content pack; see content-pipeline/pack-format/SPEC-v0.1.md) into
// WorldCommitments this kernel can replay.
//
// Deliberately minimal, not a general-purpose pack importer. It only emits
// what the current schema/relation model can actually represent without
// changes beyond the single `prop` entity-type addition in worldSchema.ts:
//
//   - entity_created + attribute_set(zh_name) for every place and entity.
//   - one relation per entity linking it to its containing place.
//
// Deliberately dropped, each a real gap surfaced by this probe rather than
// solved by it (see the probe write-up):
//   - `attrs` (sprite/trigger_mode/state) — sdlpal-specific pipeline
//     provenance metadata, not validated kernel attributes, and not
//     meaningful WorldTruth for a non-rendering-centric kernel.
//   - narrative free text — the kernel has no free-text narrative layer yet.
//   - place `adjacent` — place adjacency is hardcoded TypeScript
//     (PLACE_ADJACENCY in objectTurn.ts), not data, in this kernel today.
//
// The entity→place relation uses "part_of" as a stand-in, not "located_on":
// located_on requires its object to be a surface or a bed
// (materializedWorld.ts's apply()), which a place entity is neither, so
// located_on would throw for every single entity here. part_of is the only
// predicate in the current schema with no such restriction — but it
// ordinarily means structural containment (a drawer is part_of a
// nightstand), not "present in this place", so this is a knowingly
// wrong-shaped stand-in, not a real "entity is located in a place"
// predicate. The schema has no such predicate at all; that absence is
// itself one of this probe's findings.

import type { WorldCommitment } from "../protocol/types.js";
import { parsePack, field, type PackError } from "./packFormat.js";

export interface PackLoadResult {
  seedCommitments: WorldCommitment[];
  errors: PackError[];
  placeCount: number;
  entityCount: number;
}

export function loadPackAsSeedCommitments(packText: string): PackLoadResult {
  const { records, errors } = parsePack(packText);
  const seedCommitments: WorldCommitment[] = [];
  let placeCount = 0;
  let entityCount = 0;

  for (const record of records) {
    const id = field(record, "id");
    if (!id) continue; // parser already reported this as an error; nothing to load.

    if (record.recordType === "place") {
      seedCommitments.push({ kind: "entity_created", entityId: id, entityType: "place" });
      const zh = field(record, "zh");
      if (zh) seedCommitments.push({ kind: "attribute_set", entityId: id, attribute: "zh_name", value: zh });
      placeCount += 1;
      continue;
    }

    if (record.recordType === "entity") {
      const entityType = field(record, "type");
      if (!entityType) continue; // parser already reported this as an error.
      seedCommitments.push({ kind: "entity_created", entityId: id, entityType });
      const zh = field(record, "zh");
      if (zh) seedCommitments.push({ kind: "attribute_set", entityId: id, attribute: "zh_name", value: zh });
      const place = field(record, "place");
      if (place) {
        seedCommitments.push({
          kind: "relation_asserted",
          relationId: `pack-part-of:${id}`,
          subjectId: id,
          predicate: "part_of",
          objectId: place,
        });
      }
      entityCount += 1;
      continue;
    }
  }

  return { seedCommitments, errors, placeCount, entityCount };
}
