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
import { checkCommitmentClosureTemplates, checkIntensionalCommitmentFidelity } from "../verification/acceptanceChecks.js";

// Real dual-workstation state sequence for
// docs/MVP-intensional-commitment-fidelity-design-v0.9.md §4: resolve both
// Free notable_feature projections through a real, LLM-compiled session, then
// run checkIntensionalCommitmentFidelity against the resulting real commit
// history — confirming that what an actual player session commits is not
// just replay-stable (already proven elsewhere) but independently
// regenerable from nothing but the committed seed and value domain.
const cases = [
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "环顾四周", response: "" },
  { input: "走到客厅", response: "客厅" },
  { input: "环顾四周", response: "" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-intensional-fidelity-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "intensional-fidelity", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const result = await session.submit(item.input);
    const nonEmpty = result.response.trim().length > 0;
    const textCorrect = item.response === "" ? true : result.response.includes(item.response);
    rows.push({ input: item.input, response: result.response, kind: result.kind, correct: nonEmpty && textCorrect });
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const fidelityIssues = checkIntensionalCommitmentFidelity(commits, fixture.worldBasis);
  const hallwayFeature = world.entities.get("hallway-1")?.attributes.notable_feature;
  const livingRoomFeature = world.entities.get("living-room-1")?.attributes.notable_feature;
  const stateCorrect = Boolean(hallwayFeature) && Boolean(livingRoomFeature);
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length
    + closureIssues.filter((issue) => issue.severity === "fatal").length
    + fidelityIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, hallwayFeature, livingRoomFeature, fatalReplayIssueCount, fidelityIssues, closureIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
