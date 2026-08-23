import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkersAiClient, WORKERS_AI_MODELS } from "../ai/workersAiClient.js";
import { WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { checkInvariants, type TurnRecord } from "./invariantChecks.js";

const STOP_TOKEN = "<<STOP>>";

interface Persona {
  id: string;
  systemPrompt: string;
}

const PERSONAS: Persona[] = [
  {
    id: "methodical-explorer",
    systemPrompt: `你在扮演一个正在用 SSH 连接一个 "ttd:" 文本世界原型的真实测试者，性格严谨、有条理。
这是一个卧室场景：床、纸条、门、抽屉、钥匙、床头柜、笔、枕头、桌子。
你的目标：像真人一样系统性地探索这个世界——环顾、查看物品位置、开关抽屉/门、拿放物品、写读纸条、组合多步动作、试探边界（比如门外、走动）。
规则：
- 每次只输出你接下来要在 ttd: 提示符后输入的**一句自然语言**，可中文可英文，可以口语化，不要解释你在做什么，不要输出任何前缀、引号或元评论。
- 参考到目前为止的完整对话历史（你的输入 + 系统的真实回应），像真人一样根据上一步的结果决定下一步，不要重复完全相同的句子。
- 如果你认为已经充分探索、没有新东西可试，只输出 ${STOP_TOKEN}。`,
  },
  {
    id: "impatient-colloquial",
    systemPrompt: `你在扮演一个没耐心、说话很随意、经常用省略句和口语的真实测试者，正在用 SSH 连接一个 "ttd:" 文本世界原型。
场景是卧室：床、纸条、门、抽屉、钥匙、床头柜、笔、枕头、桌子。
你说话经常用残句、方言化表达、偶尔中英混杂或打字随意（错别字），会突然切换话题，会问一些边界外的东西（比如门外、离开房间）。
规则：
- 每次只输出接下来要输入的**一句自然语言**，不要解释、不要加引号或前缀。
- 参考完整历史，根据系统真实回应做出人类会有的反应（惊讶、追问、不耐烦地换个说法）。
- 觉得测得差不多了，只输出 ${STOP_TOKEN}。`,
  },
  {
    id: "edge-case-hunter",
    systemPrompt: `你在扮演一个专门找边界情况和 bug 的测试者（非恶意、不做安全攻击），正在用 SSH 连接一个 "ttd:" 文本世界原型。
场景是卧室：床、纸条、门、抽屉、钥匙、床头柜、笔、枕头、桌子。
你会刻意尝试：否定句、假设句、条件句、不支持的动作（移动到门外、凭空创造实体）、连续多步"然后"链式动作、对同一个事实换着法子重复提问（看答案是否前后一致）、对已关闭容器里的东西提问。
规则：
- 每次只输出接下来要输入的**一句自然语言**，不要解释、不要加引号或前缀。
- 参考完整历史决定下一步。
- 探索完成后只输出 ${STOP_TOKEN}。`,
  },
];

const MAX_TURNS_PER_PERSONA = Number(process.env.SER_HUMAN_PERSONA_TURNS ?? 15);

const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9";
const client = new WorkersAiClient({ accountId, apiToken: token, timeoutMs: 30_000, maxRetries: 2 });

async function nextPersonaUtterance(persona: Persona, history: Array<{ input: string; response: string }>): Promise<string> {
  const historyText = history.length === 0
    ? "（还没有任何对话，这是第一句）"
    : history.map((turn, index) => `第${index + 1}轮\n你: ${turn.input}\n系统: ${turn.response}`).join("\n\n");
  const result = await client.chat(WORKERS_AI_MODELS.jury, [
    { role: "system", content: persona.systemPrompt },
    { role: "user", content: `到目前为止的对话历史：\n\n${historyText}\n\n请给出你接下来要输入的下一句话。` },
  ]);
  return result.content.trim();
}

interface PersonaRunOutcome {
  persona: string;
  rows: TurnRecord[];
  violations: ReturnType<typeof checkInvariants>;
  stoppedEarly: boolean;
}

async function runPersona(persona: Persona): Promise<PersonaRunOutcome> {
  const directory = await mkdtemp(join(tmpdir(), `secondary-reality-human-persona-${persona.id}-`));
  const store = new LanceCommitStore(join(directory, "world.lancedb"));
  const session = new BedroomSession({
    sessionId: `human-persona-${persona.id}`, store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
    interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") },
  });
  const rows: TurnRecord[] = [];
  const history: Array<{ input: string; response: string }> = [];
  let stoppedEarly = false;
  try {
    for (let turnIndex = 0; turnIndex < MAX_TURNS_PER_PERSONA; turnIndex += 1) {
      let nextInput: string;
      try {
        nextInput = await nextPersonaUtterance(persona, history);
      } catch (error) {
        rows.push({ id: `${persona.id}-${turnIndex}`, input: "(persona-generation-failed)", kind: "generation-error",
          response: error instanceof Error ? error.message : String(error), commitCountBefore: (await store.list()).length, commitCountAfter: (await store.list()).length });
        break;
      }
      if (nextInput.includes(STOP_TOKEN)) { stoppedEarly = true; break; }
      const commitCountBefore = (await store.list()).length;
      let response: string;
      let kind: string;
      try {
        const result = await session.submit(nextInput);
        response = result.response;
        kind = result.kind;
      } catch (error) {
        response = error instanceof Error ? error.message : String(error);
        kind = "rejected";
      }
      const commitCountAfter = (await store.list()).length;
      rows.push({ id: `${persona.id}-${turnIndex}`, input: nextInput, kind, response, commitCountBefore, commitCountAfter });
      history.push({ input: nextInput, response });
    }
    const commits = await store.list();
    const fixture = createObjectWorldFixture();
    const violations = checkInvariants({ rows, commits, fixture }).map((violation) => ({ ...violation, turnId: violation.turnId ? `${persona.id}:${violation.turnId}` : undefined }));
    return { persona: persona.id, rows, violations, stoppedEarly };
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

// Run personas sequentially (not Promise.all) to avoid bursting the account's
// Workers AI rate limit with 3x concurrent dual-workstation traffic.
const outcomes: PersonaRunOutcome[] = [];
for (const persona of PERSONAS) outcomes.push(await runPersona(persona));
const allViolations = outcomes.flatMap((outcome) => outcome.violations);
const gatePassed = allViolations.length === 0;
const totalTurns = outcomes.reduce((sum, outcome) => sum + outcome.rows.length, 0);

await mkdir(".eval-logs", { recursive: true });
const logPath = join(".eval-logs", `human-persona-exploration-${Date.now()}.json`);
await writeFile(logPath, JSON.stringify({ gatePassed, totalTurns, outcomes }, null, 2), "utf8");

process.stdout.write(`${JSON.stringify({
  gatePassed, totalTurns, personas: outcomes.map((outcome) => ({ persona: outcome.persona, turns: outcome.rows.length, stoppedEarly: outcome.stoppedEarly, violationCount: outcome.violations.length })),
  violations: allViolations, logPath,
}, null, 2)}\n`);
process.exitCode = gatePassed ? 0 : 1;
