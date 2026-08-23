import assert from "node:assert/strict";
import test from "node:test";
import { TtdTextShell } from "../src/ssh/textShell.js";

test("shows ttd prompt and serializes complete input lines", async () => {
  let output = "";
  const submitted: string[] = [];
  const shell = new TtdTextShell({ submit: async (input) => { submitted.push(input); return { response: `现实:${input}` }; } }, { write: (text) => { output += text; }, end: () => {} });
  shell.start();
  shell.receive(Buffer.from("我下床"));
  shell.receive(Buffer.from("去开门\r\n"));
  await shell.settled();
  assert.deepEqual(submitted, ["我下床去开门"]);
  assert.match(output, /ttd: /);
  assert.match(output, /现实:我下床去开门/);
});

test("contains turn errors and closes on exit", async () => {
  let output = "";
  let ended = false;
  const shell = new TtdTextShell({ submit: async () => { throw new Error("internal details"); } }, { write: (text) => { output += text; }, end: () => { ended = true; } });
  shell.receive("未知动作\nexit\n");
  await shell.settled();
  assert.doesNotMatch(output, /internal details/);
  assert.match(output, /无法.*收束/);
  assert.equal(ended, true);
});

test("preserves Chinese input split inside a UTF-8 character", async () => {
  let received = "";
  const shell = new TtdTextShell({ submit: async (input) => { received = input; return { response: "ok" }; } }, { write: () => {}, end: () => {} });
  const encoded = Buffer.from("开门\n");
  shell.receive(encoded.subarray(0, 1));
  shell.receive(encoded.subarray(1, 4));
  shell.receive(encoded.subarray(4));
  await shell.settled();
  assert.equal(received, "开门");
});

test("offers discoverable help without invoking the world handler", async () => {
  const inputs: string[] = [];
  let output = "";
  const sink = { write(text: string) { output += text; }, end() {} };
  const shell = new TtdTextShell({ async submit(input) { inputs.push(input); return { response: "unused" }; } }, sink);
  shell.start();
  shell.receive("help\n");
  await shell.settled();
  assert.match(output, /自然说法.*它.*否定.*门外空间/u);
  assert.deepEqual(inputs, []);
});
