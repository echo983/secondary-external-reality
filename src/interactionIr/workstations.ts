import { createHash } from "node:crypto";
import type { ChatCompletionClient } from "../ai/bedroomAdapters.js";
import { WORKERS_AI_MODELS } from "../ai/workersAiClient.js";
import { interactionConsensus } from "./consensus.js";
import { parseInteractionProposalJson } from "./validator.js";
import type { InteractionEnvelopeV10, InteractionValidationResult } from "./types.js";

export interface InteractionWorkstationResult {
  validation: InteractionValidationResult;
  outputHash: string;
  model: string;
  latencyMs: number;
  usage: Record<string, unknown>;
}
export interface InteractionWorkstation { interpret(rawTtd: string): Promise<InteractionWorkstationResult> }

const schemaPrompt = `Return one Interaction IR 1.0.0 JSON object only. It describes the user's utterance, never world facts or outcomes.
The exact JSON shape is:
{"schemaVersion":"1.0.0","inputLanguage":"zh|en","speechAct":"...","actuality":"...","clauses":[{"clauseId":"c1","operation":"...","verbSpan":"exact input span","roles":[{"role":"target|destination|instrument|content","mention":"exact input span"}],"queryMode":"optional enum; omit when absent"}]}
Do not flatten clause fields into the top level. Do not output the | notation literally; select exactly one allowed enum value. Omit queryMode when it does not apply. Use [] for clauses when the speech act has no clause.
speechAct: action_request, world_query, capability_query, conversation, incomplete, unsupported.
actuality: actual, non_executing, negated, hypothetical, conditional.
operations: take, place, put_inside, open, close, observe, write, read, look_around, inspect_contents, locate, inventory, unknown.
roles: target, destination, instrument, content. queryMode: presence, value, location, contents, inventory, capability.
Role semantics: target is the entity acted on, including an object being taken and a note being written on. destination is where a target is placed or moved. instrument is a tool explicitly mentioned. content is literal information written or communicated, not a physical object being taken. Do not judge whether a target is physically capable of the action; that belongs to later grounding.
Use zero to four ordered clauses c1-c4. verbSpan and every mention must be exact contiguous input spans. Never output entity IDs, types, capabilities, state, success, evidence, commitments, inferred destinations, or explanatory fields.
Only world_query and capability_query clauses use queryMode. Action clauses always omit queryMode, including conditional actions. conversation, incomplete, unsupported, world_query, and capability_query always use actuality non_executing.
"我能拿起笔吗" is capability_query/non_executing with operation take, verbSpan 拿起, target 笔, queryMode capability. It is not an action request.
Exact example: {"schemaVersion":"1.0.0","inputLanguage":"zh","speechAct":"capability_query","actuality":"non_executing","clauses":[{"clauseId":"c1","operation":"take","verbSpan":"拿起","roles":[{"role":"target","mention":"笔"}],"queryMode":"capability"}]}
"我在哪里" is world_query/non_executing, locate, target 我, queryMode location. "你好" is conversation/non_executing with no clauses. "我向" is incomplete/non_executing with no clauses.
"我向空白便签写2236" is action_request/actual, write, target 空白便签, content 2236, and no queryMode.
"纸条上写着什么" is world_query/non_executing, read, target 纸条, queryMode value. Asking for an inscription value is read/value, not generic observe.
"我拿起桌子" is a syntactically complete action_request/actual with take and target 桌子 even if the world may later reject it. Never classify an utterance from physical feasibility.
For taking an unspecified physical thing such as 东西, use target, not content.
"不要打开抽屉" is action_request/negated. "如果抽屉里有东西就拿出来" is action_request/conditional.
"抽屉在哪" is world_query/non_executing with locate/location. "我放下笔" is action_request/actual with place and target 笔; do not invent a destination.
conversation, incomplete, and unsupported may use zero clauses.`;

export class WorkersAiInteractionWorkstation implements InteractionWorkstation {
  constructor(private readonly client: ChatCompletionClient, private readonly role: "linguist" | "safety_analyst") {}
  async interpret(rawTtd: string): Promise<InteractionWorkstationResult> {
    const started = Date.now();
    const rolePrompt = this.role === "linguist"
      ? "Act as a multilingual semantic linguist. Preserve speech act, actuality, clause order, roles, omissions, and literal wording."
      : "Act as an independent safety-focused utterance analyst. Most importantly distinguish asking whether an action is possible from requesting that it happen; preserve negation, hypothesis, conditions, and missing roles.";
    const result = await this.client.chat(WORKERS_AI_MODELS.candidate, [
      { role: "system", content: `${rolePrompt}\n${schemaPrompt}` },
      { role: "user", content: JSON.stringify({ input: rawTtd }) },
    ], { temperature: 0, max_tokens: 800, chat_template_kwargs: { enable_thinking: false } });
    return { validation: parseInteractionProposalJson(result.content, rawTtd), outputHash: createHash("sha256").update(result.content).digest("hex"),
      model: result.model, latencyMs: Date.now() - started, usage: result.usage };
  }
}

export type InteractionShadowOutcome =
  | { status: "agreed"; proposal: InteractionEnvelopeV10; workstations: [InteractionWorkstationResult, InteractionWorkstationResult] }
  | { status: "invalid" | "disagreed" | "model_error"; proposal: null; workstations?: [InteractionWorkstationResult, InteractionWorkstationResult] };

export async function runInteractionShadow(rawTtd: string, left: InteractionWorkstation, right: InteractionWorkstation): Promise<InteractionShadowOutcome> {
  try {
    const workstations = await Promise.all([left.interpret(rawTtd), right.interpret(rawTtd)]) as [InteractionWorkstationResult, InteractionWorkstationResult];
    const proposals = workstations.map((result) => result.validation.proposal);
    if (!proposals[0] || !proposals[1]) return { status: "invalid", proposal: null, workstations };
    const consensus = interactionConsensus(proposals[0], proposals[1]);
    return consensus.agreed ? { status: "agreed", proposal: consensus.proposal!, workstations } : { status: "disagreed", proposal: null, workstations };
  } catch { return { status: "model_error", proposal: null }; }
}
