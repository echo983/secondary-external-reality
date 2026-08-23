import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkersAiActionIrProposer } from "../actionIr/proposer.js";
import { WorkersAiActionIrSemanticAuditor } from "../actionIr/semanticAuditor.js";
import { WorkersAiTurnRenderer } from "../ai/bedroomAdapters.js";
import { WorkersAiClient } from "../ai/workersAiClient.js";
import { DeterministicPresentationRenderer } from "../presentation/renderer.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import { WorkersAiSemanticIrAuditor, WorkersAiSemanticIrProposer } from "../semanticIr/adapters.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";

const cases = [
  { id: "multi-view", input: "看看周围", kind: "committed", delta: 1 },
  { id: "pronoun-after-multi", input: "拿起它", kind: "rejected", delta: 0 },
  { id: "unique-key-focus", input: "钥匙在哪里", kind: "committed", delta: 1, response: /钥匙/u },
  { id: "consume-key-focus", input: "拿起它", kind: "committed", delta: 1, response: /钥匙/u },
  { id: "multi-inventory", input: "手里有什么", kind: "committed", delta: 1, response: /钥匙/u },
  { id: "no-focus-from-set", input: "它在哪里", kind: "rejected", delta: 0 },
  { id: "unique-note-focus", input: "纸条在哪里", kind: "committed", delta: 1, response: /(?:纸条|便签).*床头柜/u },
  { id: "interface-consumes-focus", input: "你好", kind: "interface", delta: 0 },
  { id: "stale-pronoun", input: "看看它", kind: "rejected", delta: 0 },
  { id: "explicit-alias-survives", input: "便签呢", kind: "committed", delta: 1, response: /(?:纸条|便签).*床头柜/u },
  { id: "pronoun-location", input: "它在哪里", kind: "committed", delta: 1, response: /(?:纸条|便签).*床头柜/u },
] as const;

const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const client = new WorkersAiClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token, timeoutMs: 30_000, maxRetries: 2 });
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-discourse-live-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({
  sessionId: "discourse-live-eval", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
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
      const responseCorrect = !("response" in item) || item.response.test(result.response);
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: result.kind, expectedCommitDelta: item.delta,
        actualCommitDelta: delta, responseCorrect, correct: result.kind === item.kind && delta === item.delta && responseCorrect, response: result.response });
    } catch (error) {
      const delta = (await store.list()).length - before;
      rows.push({ id: item.id, expectedKind: item.kind, actualKind: "rejected", expectedCommitDelta: item.delta,
        actualCommitDelta: delta, correct: item.kind === "rejected" && delta === item.delta, response: error instanceof Error ? error.message : String(error) });
    }
  }
  const fixture = createObjectWorldFixture();
  const replay = replayCanonicalViews(await store.list(), { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const fatalReplayIssues = replay.issues.filter((issue) => issue.fatal);
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, fatalReplayIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && fatalReplayIssues.length === 0 ? 0 : 1;
} finally {
  store.close();
  await rm(directory, { recursive: true, force: true });
}
