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

const cases = [
  { id: "conversation", input: "你好", speechAct: "conversation", actuality: "non_executing", legacy: "interface" },
  { id: "capability-mismatch", input: "我能拿起笔吗", speechAct: "capability_query", actuality: "non_executing", legacy: "committed" },
  { id: "colloquial-location-gap", input: "抽屉在哪", speechAct: "world_query", actuality: "non_executing", legacy: "rejected" },
  { id: "actual-action", input: "我拿起钥匙", speechAct: "action_request", actuality: "actual", legacy: "committed" },
  { id: "write-gap", input: "我向空白便签写2236", speechAct: "action_request", actuality: "actual", legacy: "rejected" },
  { id: "missing-destination", input: "我放下笔", speechAct: "action_request", actuality: "actual", legacy: "rejected" },
  { id: "negated", input: "不要打开抽屉", speechAct: "action_request", actuality: "negated", legacy: "interface" },
  { id: "fragment", input: "我向", speechAct: "incomplete", actuality: "non_executing", legacy: "interface" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-persistent-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "interaction-persistent-live", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "shadow", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    let actualLegacy: string;
    try { actualLegacy = (await session.submit(item.input)).kind; }
    catch { actualLegacy = "rejected"; }
    const audit = (await store.listInteractionIrAudits()).at(-1);
    const proposal = audit?.proposal as { speechAct?: string; actuality?: string } | undefined;
    const correct = audit?.status === "agreed" && audit.legacyOutcome === actualLegacy && actualLegacy === item.legacy &&
      proposal?.speechAct === item.speechAct && proposal.actuality === item.actuality;
    rows.push({ id: item.id, auditStatus: audit?.status, expectedLegacy: item.legacy, actualLegacy,
      expectedInteraction: { speechAct: item.speechAct, actuality: item.actuality },
      actualInteraction: proposal ? { speechAct: proposal.speechAct, actuality: proposal.actuality } : null, correct });
  }
  const fixture = createObjectWorldFixture();
  const replay = replayCanonicalViews(await store.list(), { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length;
  const passed = rows.filter((row) => row.correct).length;
  const audits = await store.listInteractionIrAudits();
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length,
    auditCount: audits.length, worldCommitCount: (await store.list()).length, fatalReplayIssueCount, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && audits.length === rows.length && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
