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

const cases = [
  { input: "走到门口", response: "门口" },
  { input: "我在哪里", response: "门口" },
  { input: "环顾四周", response: "床" },
  { input: "走到门口", response: "已经" },
  { input: "走到床边", response: "床边" },
  { input: "我在哪里", response: "床边" },
  { input: "走到桌子那", response: "" },
  { input: "看看门外", response: "" },
] as const;
const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-move-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "move-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta: (await store.list()).length - before,
        correct: item.response === "" ? result.kind !== "committed" : result.response.includes(item.response) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ input: item.input, kind: "rejected", response: message, delta: (await store.list()).length - before, correct: item.response === "" || message.includes(item.response) });
    }
  }
  const commits = await store.list(); const fixture = createObjectWorldFixture(); const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const finalPosition = world.entities.get("self")?.attributes.position;
  const stateCorrect = finalPosition === "bedside";
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length; const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, finalPosition, fatalReplayIssueCount, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
