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
operations: take, place, put_inside, open, close, observe, write, read, look_around, inspect_contents, locate, inventory, move, unknown.
roles: target, destination, instrument, content. queryMode: presence, value, location, contents, inventory, capability.
Role semantics: target is the entity acted on, including an object being taken and a note being written on. destination is where a target is placed or moved. instrument is a tool explicitly mentioned. content is literal information written or communicated, not a physical object being taken. Do not judge whether a target is physically capable of the action; that belongs to later grounding.
Perception scope is material semantics and must never be dropped. Use look_around only for genuinely unscoped inspection of the current surroundings. For a scoped request, use observe and preserve the complete scope phrase as target even when the world may not contain it. Never rewrite scoped observation as look_around.
Use zero to four ordered clauses c1-c4. verbSpan and every mention must be exact contiguous input spans. Never output entity IDs, types, capabilities, state, success, evidence, commitments, inferred destinations, or explanatory fields.
Only world_query and capability_query clauses use queryMode. Action clauses always omit queryMode, including conditional actions. conversation, incomplete, unsupported, world_query, and capability_query always use actuality non_executing.
"我能拿起笔吗" is capability_query/non_executing with operation take, verbSpan 拿起, target 笔, queryMode capability. It is not an action request.
Exact example: {"schemaVersion":"1.0.0","inputLanguage":"zh","speechAct":"capability_query","actuality":"non_executing","clauses":[{"clauseId":"c1","operation":"take","verbSpan":"拿起","roles":[{"role":"target","mention":"笔"}],"queryMode":"capability"}]}
In contrast, a bare imperative such as "拿起钥匙" is action_request/actual with operation take, verbSpan 拿起, target 钥匙, and no queryMode. Never infer an unspoken 能不能 or 吗.
"我在哪里" is world_query/non_executing, locate, target 我, queryMode location. "你好" is conversation/non_executing with no clauses. "我向" is incomplete/non_executing with no clauses.
"看看周围" is world_query/non_executing, look_around, verbSpan 看看周围, no roles, and queryMode must be omitted. The operation already carries the complete query semantics; never invent surroundings or environment as an enum value.
"我手里有什么" is world_query/non_executing, inventory, verbSpan 有什么, no roles, queryMode inventory. Inventory and look_around are zero-argument operations; phrases such as 我手里, 手中, 周围, and surroundings are not target entities.
"我向空白便签写2236" is action_request/actual, write, target 空白便签, content 2236, and no queryMode.
"纸条上写着什么" is world_query/non_executing, read, target 纸条, queryMode value. Asking for an inscription value is read/value, not generic observe.
"便签上有什么" asks for the note's inscription value: world_query/non_executing, read, target 便签, queryMode value. It is not inspect_contents because a note is not being treated as a container.
"看看门外" is world_query/non_executing, observe, target 门外, queryMode contents. "门外有什么" has the same material semantics with verbSpan 有什么 and target 门外. Neither is look_around; the later world layer decides whether 门外 exists.
"我拿起桌子" is a syntactically complete action_request/actual with take and target 桌子 even if the world may later reject it. Never classify an utterance from physical feasibility.
"走到门口" is action_request/actual, move, verbSpan 走到, destination 门口. Preserve the requested move even though the current world compiler may not provide a move primitive.
"那我写2236" is action_request/actual, write, content 2236, with no target role. 那 is a discourse connective here, not a physical target; never label demonstratives or function words as target without an explicit referent.
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
  let last: InteractionShadowOutcome = { status: "model_error", proposal: null };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const workstations = await Promise.all([left.interpret(rawTtd), right.interpret(rawTtd)]) as [InteractionWorkstationResult, InteractionWorkstationResult];
      const proposals = workstations.map((result) => result.validation.proposal);
      if (!proposals[0] || !proposals[1]) { last = { status: "invalid", proposal: null, workstations }; continue; }
      const consensus = interactionConsensus(proposals[0], proposals[1]);
      if (consensus.agreed) return { status: "agreed", proposal: consensus.proposal!, workstations };
      last = { status: "disagreed", proposal: null, workstations };
    } catch { last = { status: "model_error", proposal: null }; }
  }
  return last;
}
