import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveEvalClient } from "./liveEvalHarness.js";
import { WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { checkQueryConfluence, type QueryConfluenceRun } from "../verification/acceptanceChecks.js";
import type { EvidenceRecord } from "../protocol/types.js";

// Real-model V1 Query Confluence: unlike the zero-cost programmatic version in
// test/query-confluence.test.ts (which only varies ordering), this varies
// PHRASING through the actual dual-workstation pipeline — the thing that can
// only be checked against real models. See docs/MVP-layer-a-acceptance-tests-design-v1.0.md.

const PROBES: Array<{ probeGroup: string; phrasings: string[] }> = [
  { probeGroup: "locate-key", phrasings: ["钥匙在哪里", "钥匙到底放在什么地方", "where exactly is the key"] },
  { probeGroup: "drawer-contents", phrasings: ["抽屉里有什么", "抽屉里面装着什么东西", "what's inside the drawer"] },
  { probeGroup: "self-position", phrasings: ["我在哪里", "我现在的位置是哪", "where am I right now"] },
];

function extractFacts(evidence: readonly EvidenceRecord[] | undefined): QueryConfluenceRun["revealedFacts"] {
  return (evidence ?? []).map((entry) => ({
    subject: entry.subjectId,
    predicate: entry.kind === "attribute_observed" ? (entry.attribute ?? "") : (entry.predicate ?? entry.kind),
    value: entry.kind === "attribute_observed" ? (entry.value ?? "") : (entry.objectId ?? ""),
  }));
}

const client = await createLiveEvalClient();
const runs: QueryConfluenceRun[] = [];
const rows: Array<Record<string, unknown>> = [];

try {
  for (const { probeGroup, phrasings } of PROBES) {
    for (const phrasing of phrasings) {
      const directory = await mkdtemp(join(tmpdir(), "secondary-reality-confluence-"));
      const store = new LanceCommitStore(join(directory, "world.lancedb"));
      try {
        const session = new BedroomSession({
          sessionId: `confluence-${probeGroup}`, store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
          interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") },
        });
        await session.submit("打开抽屉");
        await session.submit("拿起钥匙");
        await session.submit("把钥匙放进抽屉");
        const result = await session.submit(phrasing);
        const facts = result.kind === "committed" ? extractFacts(result.commitPackage.evidenceGenerated) : [];
        runs.push({ probeGroup, orderingLabel: phrasing, revealedFacts: facts });
        rows.push({ probeGroup, phrasing, kind: result.kind, facts });
      } catch (error) {
        rows.push({ probeGroup, phrasing, kind: "rejected", error: error instanceof Error ? error.message : String(error) });
        runs.push({ probeGroup, orderingLabel: phrasing, revealedFacts: [] });
      } finally {
        store.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
  const violations = checkQueryConfluence(runs);
  const gatePassed = violations.every((violation) => violation.severity !== "fatal");
  process.stdout.write(`${JSON.stringify({ gatePassed, passed: gatePassed ? rows.length : 0, total: rows.length, violations, rows }, null, 2)}\n`);
  process.exitCode = gatePassed ? 0 : 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ gatePassed: false, passed: 0, total: rows.length, error: error instanceof Error ? error.message : String(error), rows }, null, 2)}\n`);
  process.exitCode = 1;
}
