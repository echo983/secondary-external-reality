import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkersAiClient } from "../ai/workersAiClient.js";
import { WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { generateHumanSimCorpus } from "./humanSimCorpus.js";
import { checkInvariants, type TurnRecord } from "./invariantChecks.js";

const seed = Number(process.env.SER_HUMAN_SIM_SEED ?? 20260823);
const count = Number(process.env.SER_HUMAN_SIM_COUNT ?? 40);
const corpus = generateHumanSimCorpus({ seed, count });

const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const client = new WorkersAiClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token, timeoutMs: 30_000, maxRetries: 2 });
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-human-sim-corpus-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({
  sessionId: "human-sim-corpus", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") },
});

const rows: TurnRecord[] = [];
try {
  for (const turn of corpus) {
    const commitCountBefore = (await store.list()).length;
    try {
      const result = await session.submit(turn.input);
      rows.push({ id: turn.id, input: turn.input, kind: result.kind, response: result.response,
        commitCountBefore, commitCountAfter: (await store.list()).length, probeGroup: turn.probeGroup });
    } catch (error) {
      rows.push({ id: turn.id, input: turn.input, kind: "rejected", response: error instanceof Error ? error.message : String(error),
        commitCountBefore, commitCountAfter: (await store.list()).length, probeGroup: turn.probeGroup });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const violations = checkInvariants({ rows, commits, fixture });
  const gatePassed = violations.length === 0;

  await mkdir(".eval-logs", { recursive: true });
  const logPath = join(".eval-logs", `human-sim-corpus-seed${seed}-${Date.now()}.json`);
  await writeFile(logPath, JSON.stringify({ seed, count, gatePassed, violations, rows }, null, 2), "utf8");

  process.stdout.write(`${JSON.stringify({
    passed: gatePassed ? rows.length : rows.length - new Set(violations.map((v) => v.turnId).filter(Boolean)).size,
    total: rows.length, fatalReplayIssueCount: violations.filter((v) => v.severity === "fatal").length,
    violations, logPath,
  }, null, 2)}\n`);
  process.exitCode = gatePassed ? 0 : 1;
} finally {
  store.close();
  await rm(directory, { recursive: true, force: true });
}
