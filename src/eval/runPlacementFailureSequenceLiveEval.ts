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
  { input: "打开抽屉", response: "打开" }, { input: "拿起钥匙", response: "拿起" },
  { input: "把钥匙放到抽屉里", response: "放进" }, { input: "拿出钥匙", response: "拿起" },
  { input: "把钥匙放到抽屉", response: "放进" }, { input: "拿出钥匙", response: "拿起" },
  { input: "把钥匙放到床上", response: "床上" }, { input: "我手里有什么", response: "没有" },
] as const;
const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-placement-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "placement-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input); const audit = (await store.listInteractionIrAudits()).at(-1);
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta: (await store.list()).length - before,
        auditStatus: audit?.status, proposal: audit?.proposal, correct: result.kind === "committed" && result.response.includes(item.response) && audit?.status === "agreed" });
    } catch (error) { rows.push({ input: item.input, kind: "rejected", response: error instanceof Error ? error.message : String(error), delta: (await store.list()).length - before, correct: false }); }
  }
  const commits = await store.list(); const fixture = createObjectWorldFixture(); const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const finalLocation = world.directLocation("key-1"); const held = world.entitiesRelatedTo("held_by", "self");
  const stateCorrect = finalLocation?.predicate === "located_on" && finalLocation.objectId === "bed-1" && held.length === 0;
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length; const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, fatalReplayIssueCount, finalLocation, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
