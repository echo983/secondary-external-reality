import { WorkersAiActionIrProposer } from "../actionIr/proposer.js";
import { createLiveEvalClient } from "./liveEvalHarness.js";
import { ACTION_IR_CORPUS, actionIrCaseMatches } from "./actionIrCorpus.js";

const proposer = new WorkersAiActionIrProposer(await createLiveEvalClient());
const rows = [];
for (const item of ACTION_IR_CORPUS) {
  try {
    const result = await proposer.propose(item.input);
    const correct = result.validation.proposal !== null && actionIrCaseMatches(result.validation.proposal, item);
    rows.push({ id: item.id, correct, valid: result.validation.valid, latencyMs: result.latencyMs, usage: result.usage,
      exitKind: result.validation.proposal?.exitKind ?? null, issues: result.validation.issues.map((issue) => issue.code) });
  } catch (error) {
    rows.push({ id: item.id, correct: false, valid: false, latencyMs: null, usage: {}, exitKind: null,
      issues: [error instanceof Error ? error.message : String(error)] });
  }
}
const passed = rows.filter((row) => row.correct).length;
process.stdout.write(`${JSON.stringify({ model: "@cf/qwen/qwen3-30b-a3b-fp8", passed, total: rows.length, accuracy: passed / rows.length, rows }, null, 2)}\n`);
process.exitCode = passed / rows.length >= 0.95 ? 0 : 1;
