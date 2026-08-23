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
  { id: "negated", input: "不要打开抽屉", kind: "interface", delta: 0, response: /不会.*实际行动/u },
  { id: "hypothetical", input: "假装把钥匙拿起来", kind: "interface", delta: 0, response: /不会.*实际行动/u },
  { id: "conditional", input: "如果抽屉里有东西就拿出来", kind: "interface", delta: 0, response: /不会.*实际行动/u },
  { id: "look-establish-discourse", input: "看看周围", kind: "committed", delta: 1, response: /床.*抽屉.*钥匙/u },
  { id: "ambiguous-pronoun", input: "把它拿起来", kind: "rejected", delta: 0 },
  { id: "explicit-alias", input: "便签呢", kind: "committed", delta: 1, response: /(?:纸条|便签).*床头柜/u },
  { id: "partial-double-open", input: "打开抽屉，然后打开抽屉", kind: "committed", delta: 1, partial: true },
  { id: "inspect-after-partial", input: "抽屉里有什么", kind: "committed", delta: 1, response: /空/u },
  { id: "partial-double-close", input: "关上抽屉，然后关上抽屉", kind: "committed", delta: 1, partial: true },
  { id: "closed-boundary", input: "抽屉里有什么", kind: "boundary", delta: 0, response: /关着/u },
  { id: "partial-state-prefix", input: "拿起钥匙，然后关上门", kind: "committed", delta: 1, partial: true },
  { id: "inventory-after-partial", input: "手里有什么", kind: "committed", delta: 1, response: /钥匙/u },
  { id: "english-negated", input: "Don't open the drawer", kind: "interface", delta: 0, response: /does not execute/iu },
] as const;

const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const client = new WorkersAiClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token, timeoutMs: 30_000, maxRetries: 2 });
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-adversarial-live-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({
  sessionId: "adversarial-live-eval", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  queryRenderer: new WorkersAiTurnRenderer(client, new DeterministicPresentationRenderer()),
  actionIr: { mode: "active", proposer: new WorkersAiActionIrProposer(client), semanticAuditor: new WorkersAiActionIrSemanticAuditor(client) },
  semanticIr: { proposer: new WorkersAiSemanticIrProposer(client), auditor: new WorkersAiSemanticIrAuditor(client) },
});

const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const commitsBefore = (await store.list()).length;
    const auditsBefore = (await store.listActionProposalAudits()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - commitsBefore;
      const audits = (await store.listActionProposalAudits()).slice(auditsBefore);
      const responseCorrect = !("response" in item) || item.response.test(result.response);
      const partialCorrect = !("partial" in item) || (result.kind === "committed" && result.partial === item.partial);
      rows.push({ id: item.id, input: item.input, expectedKind: item.kind, actualKind: result.kind,
        expectedCommitDelta: item.delta, actualCommitDelta: delta, responseCorrect, partialCorrect,
        audit: audits.map(({ status, failureStage }) => ({ status, failureStage })),
        correct: result.kind === item.kind && delta === item.delta && responseCorrect && partialCorrect, response: result.response });
    } catch (error) {
      const delta = (await store.list()).length - commitsBefore;
      const audits = (await store.listActionProposalAudits()).slice(auditsBefore);
      rows.push({ id: item.id, input: item.input, expectedKind: item.kind, actualKind: "rejected",
        expectedCommitDelta: item.delta, actualCommitDelta: delta,
        audit: audits.map(({ status, failureStage }) => ({ status, failureStage })),
        correct: item.kind === "rejected" && delta === item.delta, response: error instanceof Error ? error.message : String(error) });
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
