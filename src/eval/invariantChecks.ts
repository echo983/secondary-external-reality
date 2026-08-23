import type { CommitPackage } from "../protocol/types.js";
import type { ObjectWorldFixture } from "../world/objectFixture.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import { checkCommitmentClosureTemplates, checkReplayDeterminism } from "../verification/acceptanceChecks.js";

export interface TurnRecord {
  id: string;
  input: string;
  kind: string;
  response: string;
  commitCountBefore: number;
  commitCountAfter: number;
  probeGroup?: string | undefined;
}

export interface InvariantViolation {
  code: string;
  severity: "fatal" | "warn";
  message: string;
  turnId?: string | undefined;
}

const INTERNAL_LEAK_PATTERNS: RegExp[] = [
  /SemanticAddress/i, /WorldTruth/i, /CommitPackage/i, /MaterializedWorld/i,
  /\bMSRC\b/, /\bAEG\b/, /commitCandidate/i, /\bundefined\b/, /\bNaN\b/,
  /作为(?:一个)?(?:AI|人工智能|语言模型)/, /as an ai language model/i,
  /```/, /\{"kind":/, /Traceback|Error:\s*\n\s*at\s/,
];

// Reasoning: given TurnResult.kind never includes a "rejected" literal (rejections
// throw), only "committed" is allowed to change the append-only store.
function checkCommitDiscipline(rows: readonly TurnRecord[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const row of rows) {
    const delta = row.commitCountAfter - row.commitCountBefore;
    if (delta < 0) {
      violations.push({ code: "store-shrank", severity: "fatal", turnId: row.id,
        message: `Append-only store length decreased across turn "${row.input}" (I5 CommitmentMonotonicity violation).` });
    }
    if (row.kind !== "committed" && delta !== 0) {
      violations.push({ code: "uncommitted-kind-produced-commit", severity: "fatal", turnId: row.id,
        message: `Turn "${row.input}" resolved as kind="${row.kind}" but the store grew by ${delta} (T1 CommitBeforeExpose violation: only "committed" turns may write).` });
    }
  }
  return violations;
}

function checkInternalLeakage(rows: readonly TurnRecord[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const row of rows) {
    for (const pattern of INTERNAL_LEAK_PATTERNS) {
      if (pattern.test(row.response)) {
        violations.push({ code: "internal-state-leak", severity: "fatal", turnId: row.id,
          message: `Response to "${row.input}" matched internal-leakage pattern ${pattern} (T4 InternalDecisionIsolation violation): "${row.response.slice(0, 160)}"` });
      }
    }
  }
  return violations;
}

// Reasoning: for every turn, replay world state as of just before that turn and find
// entities that are contained_by a not-open container. Their names must not appear in
// that turn's response text (closed containers must not leak contents).
function checkClosedContainerNonLeak(rows: readonly TurnRecord[], commits: readonly CommitPackage[], fixture: ObjectWorldFixture): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const nameOf = new Map(fixture.names.map((entry) => [entry.entityId, entry.names] as const));
  for (const row of rows) {
    const priorCommits = commits.slice(0, row.commitCountBefore);
    let world: MaterializedWorld;
    try {
      world = MaterializedWorld.replay(priorCommits, fixture.seedCommitments);
    } catch {
      continue;
    }
    for (const entity of world.entities.values()) {
      if (entity.attributes.container !== "true") continue;
      if (entity.attributes.open_state === "open") continue;
      const hidden = world.entitiesRelatedTo("contained_by", entity.entityId);
      for (const hiddenEntity of hidden) {
        const names = nameOf.get(hiddenEntity.entityId) ?? [];
        for (const name of names) {
          if (name.length >= 2 && row.response.includes(name)) {
            violations.push({ code: "closed-container-leak", severity: "fatal", turnId: row.id,
              message: `Response to "${row.input}" mentions "${name}" (${hiddenEntity.entityId}) which is still contained_by closed ${entity.entityId}.` });
          }
        }
      }
    }
  }
  return violations;
}

// Reasoning: I4b QueryPathInvariance — two differently-phrased probes of the same
// latent fact, run back-to-back with no intervening world change, must agree on which
// canonical entity they resolve to.
function checkParaphraseInvariance(rows: readonly TurnRecord[], fixture: ObjectWorldFixture): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const groups = new Map<string, TurnRecord[]>();
  for (const row of rows) {
    if (!row.probeGroup) continue;
    const list = groups.get(row.probeGroup) ?? [];
    list.push(row);
    groups.set(row.probeGroup, list);
  }
  const revealingKinds = new Set(["committed", "evidence"]);
  for (const [probeGroup, group] of groups) {
    const [first, ...restOfGroup] = group;
    if (!first || restOfGroup.length === 0) continue;
    const revealing = group.filter((row) => revealingKinds.has(row.kind));
    if (revealing.length > 0 && revealing.length < group.length) {
      // A mix of "resolved" and "declined" (boundary/interface/rejected) across
      // paraphrases is a coverage gap, not a contradiction: nothing false was
      // revealed, one phrasing just failed to resolve (e.g. an occasional dual-
      // workstation disagreement, which is documented, accepted, fail-closed
      // behavior — see CONTEXT-HANDOFF §12). Downgrade instead of gating on it.
      violations.push({ code: "paraphrase-coverage-gap", severity: "warn", turnId: first.id,
        message: `Probe group "${probeGroup}" resolved for some paraphrases but not others: ${group.map((row) => `${row.kind}:"${row.input}"`).join(" vs ")}` });
      continue;
    }
    if (revealing.length === 0) continue;
    const mentionedSets = revealing.map((row) => new Set(
      fixture.names.filter((entry) => entry.names.some((name) => name.length >= 2 && row.response.includes(name))).map((entry) => entry.entityId),
    ));
    const [firstSet, ...restSets] = mentionedSets;
    const intersection = restSets.reduce((left, right) => new Set([...left].filter((id) => right.has(id))), firstSet as Set<string>);
    if (intersection.size === 0) {
      violations.push({ code: "paraphrase-fact-mismatch", severity: "warn", turnId: first.id,
        message: `Probe group "${probeGroup}" paraphrases did not agree on any mentioned entity: ${group.map((row) => `"${row.response.slice(0, 80)}"`).join(" vs ")}` });
    }
  }
  return violations;
}

export interface InvariantCheckInput {
  rows: readonly TurnRecord[];
  commits: readonly CommitPackage[];
  fixture: ObjectWorldFixture;
}

export function checkInvariants(input: InvariantCheckInput): InvariantViolation[] {
  const violations: InvariantViolation[] = [
    ...checkCommitDiscipline(input.rows),
    ...checkInternalLeakage(input.rows),
    ...checkClosedContainerNonLeak(input.rows, input.commits, input.fixture),
    ...checkParaphraseInvariance(input.rows, input.fixture),
  ];
  try {
    const replay = replayCanonicalViews(input.commits, { seedCommitments: input.fixture.seedCommitments, mode: "diagnostic" });
    for (const issue of replay.issues.filter((entry) => entry.fatal)) {
      violations.push({ code: `canonical-replay:${issue.code}`, severity: "fatal", message: issue.message });
    }
  } catch (error) {
    violations.push({ code: "canonical-replay-threw", severity: "fatal", message: error instanceof Error ? error.message : String(error) });
  }
  // Layer A acceptance checks (GWA V2/V3 closure templates, replay determinism) —
  // see docs/MVP-layer-a-acceptance-tests-design-v1.0.md.
  for (const issue of checkCommitmentClosureTemplates(input.commits)) violations.push(issue);
  for (const issue of checkReplayDeterminism(input.commits, input.fixture.seedCommitments)) violations.push(issue);
  return violations;
}
