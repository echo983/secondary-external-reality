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
import { checkCommitmentClosureTemplates } from "../verification/acceptanceChecks.js";

// Real dual-workstation state sequence for docs/MVP-memory-recollection-design-v0.6.md §6:
// write a fresh inscription, read it once (this is the only step that actually
// acquires evidence — writing itself does not), recall it immediately (must be
// exact), then spend five real, WorldTruth-committing filler turns (open the
// door, walk the whole bedroom<->hallway<->living-room chain and back) to push
// the acquisition past RECALL_FIDELITY_WINDOW, recall again (must now fade),
// and finally read the note directly one more time — this must still return
// the true value, proving the faded recollection never touched WorldTruth.
const cases = [
  { input: "拿起笔", response: "拿起" },
  { input: "我向空白便签写42", response: "42" },
  { input: "纸条上写着什么", response: "42" }, // first and only evidence-generating read
  { input: "我还记得纸条上写的是什么吗", response: "回忆起" }, // within RECALL_FIDELITY_WINDOW: exact
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到客厅", response: "客厅" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到床边", response: "床边" }, // five real commits since the read; window is 4
  { input: "我还记得纸条上写的是什么吗", response: "记不清" }, // faded: a boundary, not a wrong value
  { input: "纸条上写着什么", response: "42" }, // direct re-read: WorldTruth was never touched by the faded recollection
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-memory-recollection-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "memory-recollection-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const nonEmpty = result.response.trim().length > 0;
      const textCorrect = result.response.includes(item.response);
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta, correct: nonEmpty && textCorrect });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ input: item.input, kind: "rejected", response: message, delta: (await store.list()).length - before, correct: false });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const finalPosition = world.entities.get("self")?.attributes.position;
  const inscription = world.entities.get("blank-note-1")?.attributes.inscription;
  // The two recall turns (rows 4 and 10, one exact, one faded) must both have
  // produced zero commits — recollection, successful or faded, never writes
  // WorldTruth. Everything else in the sequence is a real committing turn.
  const recallRowsCommitNothing = rows[3]?.delta === 0 && rows[9]?.delta === 0;
  const stateCorrect = finalPosition === "bedside" && inscription === "42" && recallRowsCommitNothing;
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length + closureIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, inscription, fatalReplayIssueCount, closureIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
