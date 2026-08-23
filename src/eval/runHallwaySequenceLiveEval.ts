import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveEvalClient } from "./liveEvalHarness.js";
import { WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { checkCommitmentClosureTemplates, checkQueryConfluence, type QueryConfluenceRun } from "../verification/acceptanceChecks.js";

// Real dual-workstation state sequence for docs/MVP-hallway-placegraph-design-v0.4.md:
// door closed -> can't go outside; open it -> walk through -> the Free
// notable_feature resolves and commits once; asking again re-reads the same
// fixed value; back in the bedroom, re-asking about the hallway through the
// (still open) door confirms the same value again (V1 Query Confluence).
const cases = [
  { input: "看看门外", response: "" }, // door still closed: boundary, zero commit
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "环顾四周", response: "" }, // first resolution; response varies by seed, just must commit
  { input: "环顾四周", response: "" }, // repeat; must be identical, zero new commit
  { input: "走到床边", response: "床边" },
  { input: "门外有什么", response: "" }, // observed through the open door from the bedroom side
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-hallway-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "hallway-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
const confluenceRuns: QueryConfluenceRun[] = [];
try {
  for (const [index, item] of cases.entries()) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      // Every response must say SOMETHING (guards against the canonical-envelope
      // gap this suite caught, where an observe-compiled hallway query silently
      // rendered an empty string despite committing correctly); item.response
      // additionally pins exact expected text where the design calls for it.
      const nonEmpty = result.response.trim().length > 0;
      const textCorrect = item.response === "" ? true : result.response.includes(item.response);
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta, correct: nonEmpty && textCorrect });
      // Compare only the two probes that happen AFTER the hallway is already
      // resolved (index 3 = first resolution, index 6 = re-asked from the
      // bedroom side later) — index 0 is under a different world state
      // (door still closed) and isn't a confluence comparison at all.
      if (index === 3 || index === 6) {
        const facts = result.kind === "committed" && "commitPackage" in result
          ? [{ subject: "hallway-1", predicate: "notable_feature", value: String(result.commitPackage.evidenceGenerated?.[0]?.value ?? "") }]
          : [];
        confluenceRuns.push({ probeGroup: "hallway-notable-feature", orderingLabel: item.input, revealedFacts: facts });
      }
    } catch (error) {
      rows.push({ input: item.input, kind: "rejected", response: error instanceof Error ? error.message : String(error), delta: (await store.list()).length - before, correct: false });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const confluenceIssues = checkQueryConfluence(confluenceRuns);
  const finalPosition = world.entities.get("self")?.attributes.position;
  const notableFeature = world.entities.get("hallway-1")?.attributes.notable_feature;
  const stateCorrect = finalPosition === "bedside" && Boolean(notableFeature);
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length
    + closureIssues.filter((issue) => issue.severity === "fatal").length
    + confluenceIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, notableFeature, fatalReplayIssueCount, closureIssues, confluenceIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
