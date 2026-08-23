import { createLiveEvalClient } from "./liveEvalHarness.js";
import { WorkersAiSemanticIrAuditor, WorkersAiSemanticIrProposer } from "../semanticIr/adapters.js";
import { compileSemanticIntent } from "../semanticIr/compiler.js";
import { MaterializedWorld } from "../world/materializedWorld.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";

const cases = [
  ["纸条上写着什么", "inspect_inscription_value"], ["纸条上有字吗", "inspect_inscription_presence"], ["我想知道纸条写了什么", "inspect_inscription_value"],
  ["纸纸条上有字吗", "inspect_inscription_presence"], ["钥匙到底在哪里", "locate"], ["抽屉里面现在有什么东西", "inspect_contents"],
  ["我现在拿着哪些东西", "inventory"], ["请看一下纸条", "observe"], ["What is written on the note?", "inspect_inscription_value"],
  ["Is there any writing on the note?", "inspect_inscription_presence"], ["Where exactly is the key?", "locate"], ["What am I currently holding?", "inventory"],
] as const;
const client = await createLiveEvalClient();
const proposer = new WorkersAiSemanticIrProposer(client); const auditor = new WorkersAiSemanticIrAuditor(client);
const fixture = createObjectWorldFixture(); const world = MaterializedWorld.replay([], fixture.seedCommitments); const rows = [];
for (const [input, expected] of cases) {
  const normalized = input.replace(/^纸纸/u, "纸");
  try { const result = await proposer.propose(normalized); const proposal = result.validation.proposal; const audit = proposal ? await auditor.review(normalized, proposal) : null;
    const executable = proposal && audit?.verdict === "pass" && proposal.intents.length === 1 ? compileSemanticIntent(proposal.intents[0]!, normalized, proposal.inputLanguage, fixture, world) : null;
    rows.push({ input, expected, actual: executable?.objectIntent.operation ?? null, correct: executable?.objectIntent.operation === expected, latencyMs: result.latencyMs });
  } catch (error) { rows.push({ input, expected, actual: null, correct: false, error: error instanceof Error ? error.message : String(error) }); }
}
const passed = rows.filter((row) => row.correct).length;
process.stdout.write(`${JSON.stringify({ passed, total: rows.length, accuracy: passed / rows.length, rows }, null, 2)}\n`);
process.exitCode = passed / rows.length >= 0.95 ? 0 : 1;
