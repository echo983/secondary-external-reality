import assert from "node:assert/strict";
import test from "node:test";
import { WorkersAiClient, WorkersAiError } from "../src/ai/workersAiClient.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("reads standard choice content without exposing token", async () => {
  let authorization = "";
  const client = new WorkersAiClient({ accountId: "account", apiToken: "secret", fetchImpl: async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return response({ success: true, result: { choices: [{ message: { content: " 好 " } }], usage: { total_tokens: 3 } } });
  }});
  const result = await client.chat("model", [{ role: "user", content: "test" }]);
  assert.equal(result.content, "好");
  assert.equal(authorization, "Bearer secret");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("supports Qwen reasoning_content compatibility", async () => {
  const client = new WorkersAiClient({ accountId: "a", apiToken: "t", fetchImpl: async () => response({ success: true, result: { choices: [{ message: { content: null, reasoning_content: "candidate" } }] } }) });
  assert.equal((await client.chat("qwen", [])).content, "candidate");
});

test("retries one transient 429", async () => {
  let calls = 0;
  const client = new WorkersAiClient({ accountId: "a", apiToken: "t", maxRetries: 1, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? response({ success: false, errors: ["busy"] }, 429) : response({ success: true, result: { response: "ok" } });
  }});
  assert.equal((await client.chat("model", [])).content, "ok");
  assert.equal(calls, 2);
});

test("rejects permanent errors and empty output", async () => {
  const failed = new WorkersAiClient({ accountId: "a", apiToken: "t", fetchImpl: async () => response({ success: false, errors: ["denied"] }, 403) });
  await assert.rejects(failed.chat("model", []), WorkersAiError);
  const empty = new WorkersAiClient({ accountId: "a", apiToken: "t", fetchImpl: async () => response({ success: true, result: { choices: [{ message: { content: null } }] } }) });
  await assert.rejects(empty.chat("model", []), WorkersAiError);
});
