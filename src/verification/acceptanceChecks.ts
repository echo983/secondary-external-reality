import type { CommitPackage, WorldCommitment } from "../protocol/types.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";

export interface AcceptanceIssue {
  code: string;
  severity: "fatal" | "warn";
  message: string;
  path?: string;
}

// ---------------------------------------------------------------------------
// V2 Minimal Resolution + V3 Commitment Closure Integrity, unified.
//
// Each closed set of ObjectOperationKind actionKinds that can co-occur in one
// commit declares the EXACT shape its newWorldCommitments must have — neither
// more (V2: nothing beyond what the operation needs) nor less (V3: nothing
// partial/dangling). This is the "closed schema dependency template" the
// design doc calls for, not a general closure solver.
// ---------------------------------------------------------------------------

type ShapeCheck = (commitments: readonly WorldCommitment[]) => string | null; // null = ok, string = violation reason

function exactlyEmpty(): ShapeCheck {
  return (commitments) => (commitments.length === 0 ? null : `expected 0 commitments, found ${commitments.length}`);
}

function isAttributeSet(commitment: WorldCommitment, attribute: string): boolean {
  return commitment.kind === "attribute_set" && commitment.attribute === attribute;
}

function singleOpenStateChange(): ShapeCheck {
  return (commitments) => {
    if (commitments.length !== 1) return `expected exactly 1 commitment, found ${commitments.length}`;
    if (!isAttributeSet(commitments[0]!, "open_state")) return "expected a single open_state attribute_set";
    return null;
  };
}

function singlePositionChange(): ShapeCheck {
  return (commitments) => {
    if (commitments.length !== 1) return `expected exactly 1 commitment, found ${commitments.length}`;
    const only = commitments[0]!;
    if (!isAttributeSet(only, "position") || only.kind !== "attribute_set" || only.entityId !== "self") {
      return "expected a single self.position attribute_set";
    }
    return null;
  };
}

function relocatePair(expectedPredicate: string): ShapeCheck {
  return (commitments) => {
    if (commitments.length !== 2) return `expected exactly 2 commitments, found ${commitments.length}`;
    const ended = commitments[0]!;
    const asserted = commitments[1]!;
    if (ended.kind !== "relation_ended") return "expected the first commitment to end the prior relation";
    if (asserted.kind !== "relation_asserted" || asserted.predicate !== expectedPredicate) {
      return `expected the second commitment to assert predicate ${expectedPredicate}`;
    }
    return null;
  };
}

function singleInscriptionSet(): ShapeCheck {
  return (commitments) => {
    if (commitments.length !== 1) return `expected exactly 1 commitment, found ${commitments.length}`;
    if (!isAttributeSet(commitments[0]!, "inscription")) return "expected a single inscription attribute_set";
    return null;
  };
}

function inscriptionAndRelocate(): ShapeCheck {
  return (commitments) => {
    if (commitments.length !== 3) return `expected exactly 3 commitments, found ${commitments.length}`;
    const relationEnded = commitments[1]!;
    const relationAsserted = commitments[2]!;
    if (!isAttributeSet(commitments[0]!, "inscription")) return "expected the first commitment to set inscription";
    if (relationEnded.kind !== "relation_ended") return "expected the second commitment to end the prior relation";
    if (relationAsserted.kind !== "relation_asserted" || relationAsserted.predicate !== "contained_by") {
      return "expected the third commitment to assert contained_by";
    }
    return null;
  };
}

// look_around commits nothing UNLESS it is the first time some place's Free
// notable_feature projection is operationally addressed, in which case it
// commits exactly that one attribute_set (design doc §3.2/§3.3, and
// -living-room-design-v0.5.md §3 for the second place reusing this same
// shape) — a legitimate example of one actionKind having two lawful closure
// shapes depending on whether the world has already resolved this projection.
const PLACES_WITH_FREE_NOTABLE_FEATURE = new Set(["hallway-1", "living-room-1"]);
function emptyOrFirstPlaceResolution(): ShapeCheck {
  return (commitments) => {
    if (commitments.length === 0) return null;
    if (commitments.length !== 1) return `expected 0 or 1 commitments, found ${commitments.length}`;
    const only = commitments[0]!;
    if (only.kind !== "attribute_set" || !PLACES_WITH_FREE_NOTABLE_FEATURE.has(only.entityId) || only.attribute !== "notable_feature") {
      return "the only commitment look_around may make is a place's first-resolution notable_feature";
    }
    return null;
  };
}

// Keyed by the sorted, comma-joined set of actionKinds present in one commit's events.
const CLOSURE_TEMPLATES: Record<string, ShapeCheck> = {
  "": exactlyEmpty(),
  "close": singleOpenStateChange(),
  "open": singleOpenStateChange(),
  "find,read": exactlyEmpty(),
  "inspect_contents": exactlyEmpty(),
  "inspect_contents,open": singleOpenStateChange(),
  "inspect_inscription_presence": exactlyEmpty(),
  "inspect_inscription_value": exactlyEmpty(),
  "inventory": exactlyEmpty(),
  "locate": exactlyEmpty(),
  "look_around": emptyOrFirstPlaceResolution(),
  "move": singlePositionChange(),
  "observe": exactlyEmpty(),
  "observe,open": singleOpenStateChange(),
  "place": relocatePair("located_on"),
  "place,write": inscriptionAndRelocate(),
  "put_inside": relocatePair("contained_by"),
  "self_position": exactlyEmpty(),
  "self_posture": exactlyEmpty(),
  "take": relocatePair("held_by"),
  "write": singleInscriptionSet(),
};

export function checkCommitmentClosureTemplates(commits: readonly CommitPackage[]): AcceptanceIssue[] {
  const issues: AcceptanceIssue[] = [];
  for (const commit of commits) {
    const actionKinds = [...new Set(commit.events.map((event) => event.actionKind).filter((kind): kind is string => Boolean(kind)))].sort();
    const key = actionKinds.join(",");
    const check = CLOSURE_TEMPLATES[key];
    if (!check) {
      issues.push({ code: "UNKNOWN_CLOSURE_TEMPLATE", severity: "warn",
        message: `Commit ${commit.turnId}#${commit.commitSequence} has no declared closure template for actionKind set [${key}]; add one instead of leaving it unchecked.` });
      continue;
    }
    const violation = check(commit.newWorldCommitments);
    if (violation) {
      issues.push({ code: "CLOSURE_TEMPLATE_VIOLATION", severity: "fatal",
        message: `Commit ${commit.turnId}#${commit.commitSequence} (actionKinds [${key}]) violates its closure template: ${violation}` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Replay Consistency: replay must be a deterministic, order-independent pure
// function of (commits, seedCommitments).
// ---------------------------------------------------------------------------

export function checkReplayDeterminism(
  commits: readonly CommitPackage[],
  seedCommitments: readonly WorldCommitment[],
): AcceptanceIssue[] {
  const issues: AcceptanceIssue[] = [];
  const first = MaterializedWorld.replay(commits, seedCommitments);
  const second = MaterializedWorld.replay(commits, seedCommitments);
  const serialize = (world: MaterializedWorld): string => JSON.stringify({
    entities: [...world.entities.entries()].sort(([a], [b]) => a.localeCompare(b)),
    relations: [...world.relations.entries()].sort(([a], [b]) => a.localeCompare(b)),
  });
  if (serialize(first) !== serialize(second)) {
    issues.push({ code: "REPLAY_NOT_DETERMINISTIC", severity: "fatal", message: "Replaying the same commits twice produced different world states." });
  }

  const shuffled = [...commits].reverse();
  const third = MaterializedWorld.replay(shuffled, seedCommitments);
  if (serialize(first) !== serialize(third)) {
    issues.push({ code: "REPLAY_ORDER_DEPENDENT", severity: "fatal", message: "Replay result depends on array input order rather than commitSequence." });
  }

  try {
    const diagnosticFirst = replayCanonicalViews(commits, { seedCommitments, mode: "diagnostic" });
    const diagnosticSecond = replayCanonicalViews(commits, { seedCommitments, mode: "diagnostic" });
    if (JSON.stringify(diagnosticFirst.issues) !== JSON.stringify(diagnosticSecond.issues)) {
      issues.push({ code: "CANONICAL_REPLAY_NOT_DETERMINISTIC", severity: "fatal", message: "Canonical replay diagnostic issues differed across two runs of the same commits." });
    }
  } catch (error) {
    issues.push({ code: "CANONICAL_REPLAY_THREW", severity: "fatal", message: error instanceof Error ? error.message : String(error) });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// V1 Query Confluence: the same latent fact, probed via different orderings
// and/or phrasings from an identical prior world state, must resolve to the
// same canonical (subject, predicate, value) triples every time.
// ---------------------------------------------------------------------------

export interface QueryConfluenceRun {
  probeGroup: string;
  orderingLabel: string;
  revealedFacts: ReadonlyArray<{ subject: string; predicate: string; value: string }>;
}

function factKey(fact: QueryConfluenceRun["revealedFacts"][number]): string {
  return `${fact.subject}|${fact.predicate}|${fact.value}`;
}

export function checkQueryConfluence(runs: readonly QueryConfluenceRun[]): AcceptanceIssue[] {
  const issues: AcceptanceIssue[] = [];
  const byGroup = new Map<string, QueryConfluenceRun[]>();
  for (const run of runs) {
    const list = byGroup.get(run.probeGroup) ?? [];
    list.push(run);
    byGroup.set(run.probeGroup, list);
  }
  for (const [probeGroup, group] of byGroup) {
    if (group.length < 2) continue;
    // A run that revealed nothing (setup failure, occasional dual-workstation
    // disagreement, unresolved phrasing) is a coverage gap, not a confluence
    // violation: it did not assert a DIFFERENT fact, it asserted none. Only
    // compare pairs where both sides actually revealed something.
    const revealing = group.filter((run) => run.revealedFacts.length > 0);
    if (revealing.length < group.length) {
      issues.push({ code: "QUERY_CONFLUENCE_COVERAGE_GAP", severity: "warn",
        message: `Probe group "${probeGroup}" revealed nothing for: ${group.filter((run) => run.revealedFacts.length === 0).map((run) => run.orderingLabel).join(", ")}` });
    }
    if (revealing.length < 2) continue;
    const [first, ...rest] = revealing;
    const firstKeys = new Set(first!.revealedFacts.map(factKey));
    for (const run of rest) {
      const runKeys = new Set(run.revealedFacts.map(factKey));
      const symmetricDifference = [...firstKeys].filter((key) => !runKeys.has(key)).concat([...runKeys].filter((key) => !firstKeys.has(key)));
      if (symmetricDifference.length > 0) {
        issues.push({ code: "QUERY_CONFLUENCE_VIOLATION", severity: "fatal",
          message: `Probe group "${probeGroup}" diverged between ordering "${first!.orderingLabel}" and "${run.orderingLabel}": ${symmetricDifference.join(", ")}` });
      }
    }
  }
  return issues;
}
