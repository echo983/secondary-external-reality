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
  { id: "conversation", input: "你好", kind: "interface", delta: 0, code: "INTERACTION_CONVERSATION" },
  { id: "look-around", input: "看看周围", kind: "committed", delta: 1, response: "床" },
  { id: "empty-inventory", input: "我手里有什么", kind: "committed", delta: 1, response: "没有" },
  { id: "capability", input: "我能拿起笔吗", kind: "interface", delta: 0, code: "INTERACTION_CAPABILITY_QUERY" },
  { id: "drawer-location", input: "抽屉在哪", kind: "committed", delta: 1, response: "床头柜" },
  // Door is never opened in this sequence, so "门外" now resolves to the real
  // hallway-1 entity but is correctly not perceivable through a closed door —
  // a "boundary" (target exists, not currently perceivable), not an
  // unresolved-reference interface response as before hallway-1 existed.
  { id: "outside-scope", input: "看看门外", kind: "boundary", delta: 0 },
  { id: "outside-contents", input: "门外有什么", kind: "boundary", delta: 0 },
  { id: "write-without-pen", input: "我向空白便签写2236", kind: "rejected", delta: 0 },
  { id: "take-pen", input: "我拿起笔", kind: "committed", delta: 1 },
  { id: "numeric-write", input: "我向空白便签写2236", kind: "committed", delta: 1, response: "2236" },
  { id: "colloquial-inscription", input: "便签上有什么", kind: "committed", delta: 1, response: "2236" },
  { id: "read-note", input: "纸条上写着什么", kind: "committed", delta: 1, response: "2236" },
  { id: "missing-write-target", input: "那我写2236", kind: "interface", delta: 0, code: "INTERACTION_MISSING_TARGET" },
  { id: "missing-destination", input: "我放下笔", kind: "interface", delta: 0, code: "INTERACTION_MISSING_DESTINATION" },
  { id: "grounding-rejects-table", input: "我拿起桌子", kind: "rejected", delta: 0 },
  { id: "negated", input: "不要打开抽屉", kind: "interface", delta: 0, code: "INTERACTION_NON_ACTUAL" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-active-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "interaction-active-live", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const codeCorrect = !("code" in item) || (result.kind === "interface" && result.code === item.code);
      const responseCorrect = !("response" in item) || result.response.includes(item.response);
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: result.kind, expectedCommitDelta: item.delta, actualCommitDelta: delta,
        ...(result.kind === "interface" ? { actualCode: result.code } : {}), codeCorrect, responseCorrect,
        correct: result.kind === item.kind && delta === item.delta && codeCorrect && responseCorrect });
    } catch {
      const delta = (await store.list()).length - before;
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: "rejected", expectedCommitDelta: item.delta,
        actualCommitDelta: delta, correct: item.kind === "rejected" && delta === item.delta });
    }
  }
  const audits = await store.listInteractionIrAudits();
  const replay = replayCanonicalViews(await store.list(), { seedCommitments: createObjectWorldFixture().seedCommitments, mode: "diagnostic" });
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, auditCount: audits.length,
    agreedAuditCount: audits.filter((audit) => audit.status === "agreed").length, worldCommitCount: (await store.list()).length, fatalReplayIssueCount, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && audits.length === rows.length && audits.every((audit) => audit.mode === "active") && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
