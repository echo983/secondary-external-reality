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

// Real dual-workstation state sequence for docs/MVP-living-room-placegraph-design-v0.5.md §6:
// walk bedroom -> hallway (first Free resolution) -> living room (second,
// independent Free resolution) -> back to hallway (re-probe living room
// remotely, must match) -> close the door FROM THE HALLWAY SIDE -> attempting
// to walk back must now fail (the bidirectional-door regression this design
// exists to fix) -> reopen -> walk home. This is the one suite that proves
// both halves of the design in a single continuous, real-model-compiled run.
const cases = [
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "环顾四周", response: "" }, // hallway-1 first resolution
  { input: "走到客厅", response: "客厅" },
  { input: "环顾四周", response: "" }, // living-room-1 first resolution, independent of hallway's
  { input: "走到走廊", response: "走廊" },
  { input: "客厅有什么", response: "" }, // re-probed remotely from the hallway side; must match the earlier resolution
  { input: "关上门", response: "关上" },
  { input: "走到床边", response: "", expectReject: true }, // door closed FROM THE HALLWAY SIDE: must now block, not just the bedroom->hallway direction
  { input: "打开门", response: "打开" },
  { input: "走到床边", response: "床边" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-living-room-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "living-room-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
const confluenceRuns: QueryConfluenceRun[] = [];
try {
  for (const [index, item] of cases.entries()) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const nonEmpty = result.response.trim().length > 0;
      const textCorrect = item.response === "" ? true : result.response.includes(item.response);
      const expectedReject = "expectReject" in item && item.expectReject === true;
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta, correct: !expectedReject && nonEmpty && textCorrect });
      // index 4 = living-room-1's first resolution, index 6 = the same fact
      // re-probed remotely from the hallway side later — these two must agree
      // (V1 Query Confluence), independently of the hallway probes below.
      if (index === 4 || index === 6) {
        const facts = result.kind === "committed" && "commitPackage" in result
          ? [{ subject: "living-room-1", predicate: "notable_feature", value: String(result.commitPackage.evidenceGenerated?.[0]?.value ?? "") }]
          : [];
        confluenceRuns.push({ probeGroup: "living-room-notable-feature", orderingLabel: item.input, revealedFacts: facts });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expectedReject = "expectReject" in item && item.expectReject === true;
      rows.push({ input: item.input, kind: "rejected", response: message, delta: (await store.list()).length - before, correct: expectedReject });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const confluenceIssues = checkQueryConfluence(confluenceRuns);
  const finalPosition = world.entities.get("self")?.attributes.position;
  const hallwayFeature = world.entities.get("hallway-1")?.attributes.notable_feature;
  const livingRoomFeature = world.entities.get("living-room-1")?.attributes.notable_feature;
  // Independence between the two resolvers is proven deterministically in
  // test/object-turn.test.ts (fixed seed, no coincidence possible); asserting
  // it here too would be flaky — both value domains share "none", so two
  // genuinely independent resolutions can legitimately land on the same
  // value by chance, and that must not be scored as a mechanism failure.
  const stateCorrect = finalPosition === "bedside" && Boolean(hallwayFeature) && Boolean(livingRoomFeature);
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length
    + closureIssues.filter((issue) => issue.severity === "fatal").length
    + confluenceIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, hallwayFeature, livingRoomFeature, fatalReplayIssueCount, closureIssues, confluenceIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
