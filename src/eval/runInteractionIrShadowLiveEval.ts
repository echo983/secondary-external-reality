import { readFile } from "node:fs/promises";
import { WorkersAiClient } from "../ai/workersAiClient.js";
import { runInteractionShadow, WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import type { InteractionActuality, InteractionOperation, InteractionSpeechAct } from "../interactionIr/types.js";

interface Expected { speechAct: InteractionSpeechAct; actuality: InteractionActuality; operations?: InteractionOperation[] }
const cases: Array<{ id: string; input: string; expected: Expected }> = [
  { id: "greeting", input: "你好", expected: { speechAct: "conversation", actuality: "non_executing" } },
  { id: "self-location", input: "我在哪里", expected: { speechAct: "world_query", actuality: "non_executing", operations: ["locate"] } },
  { id: "colloquial-location", input: "抽屉在哪", expected: { speechAct: "world_query", actuality: "non_executing", operations: ["locate"] } },
  { id: "capability-not-action", input: "我能拿起笔吗", expected: { speechAct: "capability_query", actuality: "non_executing", operations: ["take"] } },
  { id: "actual-take", input: "我拿起笔", expected: { speechAct: "action_request", actuality: "actual", operations: ["take"] } },
  { id: "negated-open", input: "不要打开抽屉", expected: { speechAct: "action_request", actuality: "negated", operations: ["open"] } },
  { id: "conditional-take", input: "如果抽屉里有东西就拿出来", expected: { speechAct: "action_request", actuality: "conditional", operations: ["take"] } },
  { id: "numeric-write", input: "我向空白便签写2236", expected: { speechAct: "action_request", actuality: "actual", operations: ["write"] } },
  { id: "write-missing-target", input: "那我写2236", expected: { speechAct: "action_request", actuality: "actual", operations: ["write"] } },
  { id: "place-missing-destination", input: "我放下笔", expected: { speechAct: "action_request", actuality: "actual", operations: ["place"] } },
  { id: "nonportable-language-neutral", input: "我拿起桌子", expected: { speechAct: "action_request", actuality: "actual", operations: ["take"] } },
  { id: "pillow-language-neutral", input: "我拿起枕头", expected: { speechAct: "action_request", actuality: "actual", operations: ["take"] } },
  { id: "fragment", input: "我向", expected: { speechAct: "incomplete", actuality: "non_executing" } },
  { id: "ordered-actions", input: "打开抽屉，然后关上抽屉", expected: { speechAct: "action_request", actuality: "actual", operations: ["open", "close"] } },
];

const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const client = new WorkersAiClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token, timeoutMs: 30_000, maxRetries: 2 });
const left = new WorkersAiInteractionWorkstation(client, "linguist");
const right = new WorkersAiInteractionWorkstation(client, "safety_analyst");
const rows: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const outcome = await runInteractionShadow(item.input, left, right);
  const actual = outcome.proposal;
  const operations = actual?.clauses.map((clause) => clause.operation);
  const correct = outcome.status === "agreed" && actual?.speechAct === item.expected.speechAct && actual.actuality === item.expected.actuality &&
    (item.expected.operations === undefined || JSON.stringify(operations) === JSON.stringify(item.expected.operations));
  rows.push({ id: item.id, status: outcome.status, expected: item.expected,
    actual: actual ? { speechAct: actual.speechAct, actuality: actual.actuality, operations } : null, correct });
}
const passed = rows.filter((row) => row.correct).length;
const unsafeCapabilityExecution = rows.some((row) => row.id === "capability-not-action" && (row.actual as { speechAct?: string } | null)?.speechAct === "action_request");
process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, unsafeCapabilityExecution, rows }, null, 2)}\n`);
process.exitCode = passed === rows.length && !unsafeCapabilityExecution ? 0 : 1;
