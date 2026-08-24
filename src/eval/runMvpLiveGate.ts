import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const suites = [
  { name: "ordinary-language", module: "./runHumanInputLiveEval.js" },
  { name: "adversarial-language", module: "./runAdversarialLanguageLiveEval.js" },
  { name: "discourse-contract", module: "./runDiscourseContractLiveEval.js" },
  { name: "interaction-ir-shadow", module: "./runInteractionIrShadowLiveEval.js" },
  { name: "interaction-ir-guard", module: "./runInteractionIrGuardLiveEval.js" },
  { name: "interaction-ir-active", module: "./runInteractionIrActiveLiveEval.js" },
  { name: "human-round3-sequence", module: "./runHumanRound3SequenceLiveEval.js" },
  { name: "placement-failure-sequence", module: "./runPlacementFailureSequenceLiveEval.js" },
  { name: "move-sequence", module: "./runMoveSequenceLiveEval.js" },
  { name: "query-confluence", module: "./runQueryConfluenceLiveEval.js" },
  { name: "hallway-sequence", module: "./runHallwaySequenceLiveEval.js" },
  { name: "living-room-sequence", module: "./runLivingRoomSequenceLiveEval.js" },
  { name: "memory-recollection-sequence", module: "./runMemoryRecollectionSequenceLiveEval.js" },
  { name: "human-simulation-corpus", module: "./runHumanSimulationCorpusLiveEval.js" },
] as const;

interface SuitePayload {
  passed: number;
  total: number;
  accuracy: number;
  fatalReplayIssues?: unknown[];
  fatalReplayIssueCount?: number;
}

const summaries: Array<Record<string, unknown>> = [];
for (const suite of suites) {
  const modulePath = fileURLToPath(new URL(suite.module, import.meta.url));
  try {
    const { stdout } = await execFileAsync(process.execPath, [modulePath], {
      cwd: process.cwd(), env: process.env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout.trim()) as SuitePayload;
    const fatalReplayIssueCount = payload.fatalReplayIssueCount ?? payload.fatalReplayIssues?.length ?? 0;
    summaries.push({ suite: suite.name, passed: payload.passed, total: payload.total,
      accuracy: payload.accuracy, fatalReplayIssueCount,
      gatePassed: payload.passed === payload.total && fatalReplayIssueCount === 0 });
  } catch (error) {
    const candidate = error as { stdout?: string };
    try {
      const payload = JSON.parse(candidate.stdout?.trim() ?? "") as SuitePayload;
      const fatalReplayIssueCount = payload.fatalReplayIssueCount ?? payload.fatalReplayIssues?.length ?? 0;
      summaries.push({ suite: suite.name, passed: payload.passed, total: payload.total,
        accuracy: payload.accuracy, fatalReplayIssueCount, gatePassed: false });
    } catch {
      summaries.push({ suite: suite.name, gatePassed: false, failure: "SUITE_PROCESS_OR_OUTPUT_INVALID" });
    }
  }
}

const passed = summaries.reduce((sum, item) => sum + (typeof item.passed === "number" ? item.passed : 0), 0);
const total = summaries.reduce((sum, item) => sum + (typeof item.total === "number" ? item.total : 0), 0);
const gatePassed = summaries.length === suites.length && summaries.every((item) => item.gatePassed === true);
process.stdout.write(`${JSON.stringify({ gatePassed, passed, total, suites: summaries }, null, 2)}\n`);
process.exitCode = gatePassed ? 0 : 1;
