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
  { id: "capability", input: "我能拿起笔吗", kind: "interface", delta: 0, code: "INTERACTION_CAPABILITY_QUERY" },
  { id: "actual-take", input: "我拿起笔", kind: "committed", delta: 1 },
  { id: "inventory-query", input: "我手里有什么", kind: "committed", delta: 1 },
  { id: "negated", input: "不要打开抽屉", kind: "interface", delta: 0, code: "INTERACTION_NON_ACTUAL" },
  { id: "conditional", input: "如果抽屉里有东西就拿出来", kind: "interface", delta: 0, code: "INTERACTION_NON_ACTUAL" },
  { id: "fragment", input: "我向", kind: "interface", delta: 0, code: "INTERACTION_INCOMPLETE" },
  { id: "location-language-gap", input: "抽屉在哪", kind: "rejected", delta: 0 },
  { id: "write-compiler-gap", input: "我向空白便签写2236", kind: "rejected", delta: 0 },
  { id: "missing-destination", input: "我放下笔", kind: "rejected", delta: 0 },
  { id: "capability-grounding-gap", input: "我拿起桌子", kind: "rejected", delta: 0 },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-interaction-guard-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "interaction-guard-live", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "guard", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const codeCorrect = !("code" in item) || (result.kind === "interface" && result.code === item.code);
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: result.kind, expectedCommitDelta: item.delta,
        actualCommitDelta: delta, codeCorrect, correct: result.kind === item.kind && delta === item.delta && codeCorrect });
    } catch {
      const delta = (await store.list()).length - before;
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: "rejected", expectedCommitDelta: item.delta,
        actualCommitDelta: delta, correct: item.kind === "rejected" && delta === item.delta });
    }
  }
  const audits = await store.listInteractionIrAudits();
  const fixture = createObjectWorldFixture();
  const replay = replayCanonicalViews(await store.list(), { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, auditCount: audits.length,
    agreedAuditCount: audits.filter((audit) => audit.status === "agreed").length, worldCommitCount: (await store.list()).length,
    fatalReplayIssueCount, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && audits.length === rows.length && audits.every((audit) => audit.mode === "guard") && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
