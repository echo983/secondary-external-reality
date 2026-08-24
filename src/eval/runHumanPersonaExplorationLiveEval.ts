import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WORKERS_AI_MODELS } from "../ai/workersAiClient.js";
import { createLiveEvalClient } from "./liveEvalHarness.js";
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
  {
    // Added for docs/DEMO-PHASE-plan-v1.0.md §3.2 — the other three personas
    // explore broadly, but nothing pushes toward the specific sequence a
    // non-technical demo audience needs to hold up: write+hide a note, drift
    // away to other things, come back and ask about it later (recollection
    // decay), ask the roommate (testimony), and casually probe something
    // clearly out of scope (honest refusal). This persona is deliberately
    // NOT told about RECALL_FIDELITY_WINDOW or any internal mechanism — it
    // only knows the surface scene, same as a real unbriefed visitor.
    id: "demo-rehearsal-newcomer",
    systemPrompt: `你在扮演一个第一次接触这个 "ttd:" 文本世界原型的普通人，不懂技术、不知道背后是怎么实现的，是被朋友邀请来试玩的。
场景是卧室：你坐在床边，桌上放着一把钥匙，床头柜上有一支笔和一张空白的纸条，房门关着，室友就在旁边——这些都是你刚进来时已经看到的，不用再花时间去别的地方找纸条和笔。
你说话很随意、口语化，可能有点犹豫或东张西望，不会用任何"专业"说法。遇到不确定的，你更倾向于直接试着做做看，而不是反复先问"我能不能……"。
你这次探索有几件事迟早想试一下（不用按顺序，也不用刻意生硬地一件接一件，像真人一样自然地穿插）：
1. 随便写点什么在纸条上并藏起来（内容随便编，比如几个数字或一句话）；
2. 藏完之后先去做点别的事、四处看看、跟房间里的人聊两句，别马上回去看纸条；
3. 过一会儿，很随意地问自己还记不记得刚才纸条上写的是什么；
4. 问一下室友知不知道纸条上写的是什么；
5. 随口问一个明显超出这个小房间范围的东西（比如"门外的天气怎么样"、"我手机在哪"、"现在几点了"），看看它会怎么应对。
规则：
- 每次只输出你接下来要在 ttd: 提示符后输入的**一句自然语言**，可中文可英文，可以口语化甚至带点犹豫或多余的话，不要解释你在做什么，不要输出任何前缀、引号或元评论。
- 参考到目前为止的完整对话历史，像真人一样根据上一步的结果自然地决定下一步。
- 五件事都试过、或者你觉得已经充分体验了，只输出 ${STOP_TOKEN}。`,
  },
];

const MAX_TURNS_PER_PERSONA = Number(process.env.SER_HUMAN_PERSONA_TURNS ?? 15);
// Optional comma-separated persona id filter, so a single new persona can be
// validated on its own without spending Workers AI quota re-running the
// other already-proven personas every time.
const PERSONA_ID_FILTER = process.env.SER_HUMAN_PERSONA_ID_FILTER?.split(",").map((id) => id.trim()).filter(Boolean);

const client = await createLiveEvalClient();

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
for (const persona of PERSONAS) {
  if (PERSONA_ID_FILTER && !PERSONA_ID_FILTER.includes(persona.id)) continue;
  outcomes.push(await runPersona(persona));
}
const allViolations = outcomes.flatMap((outcome) => outcome.violations);
const gatePassed = allViolations.every((violation) => violation.severity !== "fatal");
const totalTurns = outcomes.reduce((sum, outcome) => sum + outcome.rows.length, 0);

await mkdir(".eval-logs", { recursive: true });
const logPath = join(".eval-logs", `human-persona-exploration-${Date.now()}.json`);
await writeFile(logPath, JSON.stringify({ gatePassed, totalTurns, outcomes }, null, 2), "utf8");

process.stdout.write(`${JSON.stringify({
  gatePassed, totalTurns, personas: outcomes.map((outcome) => ({ persona: outcome.persona, turns: outcome.rows.length, stoppedEarly: outcome.stoppedEarly, violationCount: outcome.violations.length })),
  violations: allViolations, logPath,
}, null, 2)}\n`);
process.exitCode = gatePassed ? 0 : 1;
