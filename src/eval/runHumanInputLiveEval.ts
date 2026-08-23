import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkersAiActionIrProposer } from "../actionIr/proposer.js";
import { WorkersAiActionIrSemanticAuditor } from "../actionIr/semanticAuditor.js";
import { WorkersAiTurnRenderer } from "../ai/bedroomAdapters.js";
import { createLiveEvalClient } from "./liveEvalHarness.js";
import { DeterministicPresentationRenderer } from "../presentation/renderer.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import { WorkersAiSemanticIrAuditor, WorkersAiSemanticIrProposer } from "../semanticIr/adapters.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";

const cases = [
  { id: "greeting", input: "你好呀", expectedKind: "interface", expectedCommitDelta: 0, expectedResponse: /ttd/u },
  { id: "look-colloquial", input: "我随便瞅瞅这屋里都有啥", expectedKind: "committed", expectedCommitDelta: 1, expectedResponse: /床.*门.*抽屉/u },
  { id: "self-location", input: "我在哪里", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "self-bed", input: "我在床上吗", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "alias-ellipsis", input: "便签呢", expectedKind: "committed", expectedCommitDelta: 1, expectedResponse: /(?:纸条|便签).*床头柜/u },
  { id: "unsupported-writing", input: "在便签上随便写个 hello", expectedKind: "interface", expectedCommitDelta: 0 },
  { id: "fragment", input: "把", expectedKind: "interface", expectedCommitDelta: 0 },
  { id: "outside", input: "我看看门外头有什么", expectedKind: "interface", expectedCommitDelta: 0 },
  { id: "take-colloquial", input: "顺手把那支笔拿起来吧", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "inventory-colloquial", input: "我现在手上都拿了啥呀", expectedKind: "committed", expectedCommitDelta: 1, expectedResponse: /笔/u },
  { id: "inscription-typo", input: "纸纸条上到底写没写东西", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "contents-colloquial-closed", input: "抽屉里头现在都有啥", expectedKind: "boundary", expectedCommitDelta: 0 },
  { id: "open-colloquial", input: "劳驾把抽屉打开看看", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "contents-colloquial-open", input: "所以抽屉里面究竟有什么东西", expectedKind: "committed", expectedCommitDelta: 1 },
  { id: "unsupported-impossible", input: "把我的影子折起来塞进抽屉", expectedKind: "rejected", expectedCommitDelta: 0 },
  { id: "english-location", input: "Where exactly did I leave the key?", expectedKind: "committed", expectedCommitDelta: 1 },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-human-live-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({
  sessionId: "human-live-eval", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  queryRenderer: new WorkersAiTurnRenderer(client, new DeterministicPresentationRenderer()),
  actionIr: { mode: "active", proposer: new WorkersAiActionIrProposer(client), semanticAuditor: new WorkersAiActionIrSemanticAuditor(client) },
  semanticIr: { proposer: new WorkersAiSemanticIrProposer(client), auditor: new WorkersAiSemanticIrAuditor(client) },
});
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const responseCorrect = !("expectedResponse" in item) || item.expectedResponse.test(result.response);
      rows.push({ id: item.id, input: item.input, expectedKind: item.expectedKind, actualKind: result.kind, expectedCommitDelta: item.expectedCommitDelta,
        actualCommitDelta: delta, responseCorrect, correct: result.kind === item.expectedKind && delta === item.expectedCommitDelta && responseCorrect, response: result.response });
    } catch (error) {
      const delta = (await store.list()).length - before;
      rows.push({ id: item.id, input: item.input, expectedKind: item.expectedKind, actualKind: "rejected", expectedCommitDelta: item.expectedCommitDelta,
        actualCommitDelta: delta, correct: item.expectedKind === "rejected" && delta === item.expectedCommitDelta, response: error instanceof Error ? error.message : String(error) });
    }
  }
  const passed = rows.filter((row) => row.correct).length;
  const fixture = createObjectWorldFixture();
  const replay = replayCanonicalViews(await store.list(), { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const fatalReplayIssues = replay.issues.filter((issue) => issue.fatal);
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, fatalReplayIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && fatalReplayIssues.length === 0 ? 0 : 1;
} finally {
  store.close();
  await rm(directory, { recursive: true, force: true });
}
