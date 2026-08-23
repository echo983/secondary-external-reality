import { readFile } from "node:fs/promises";
import { WorkersAiClient } from "../ai/workersAiClient.js";

// Shared by every real-model eval script so the account/token/timeout/retry
// defaults can't silently drift between suites (see docs/MILESTONE-minimal-space-movement-v0.3.0.md
// for why duplicated gate logic — the same class of problem — was worth fixing).
export async function createLiveEvalClient(overrides: { timeoutMs?: number; maxRetries?: number } = {}): Promise<WorkersAiClient> {
  const token = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
  return new WorkersAiClient({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9",
    apiToken: token,
    timeoutMs: overrides.timeoutMs ?? 30_000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}
