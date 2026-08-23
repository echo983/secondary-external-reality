import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ssh2 from "ssh2";
import { createSshMvpServer } from "../src/ssh/server.js";

const { Client } = ssh2;

test("accepts a standard SSH shell and presents the ttd prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secondary-reality-ssh-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const { server } = createSshMvpServer({
    host: "127.0.0.1",
    port: 0,
    username: "ttd",
    password: "test-password",
    hostKey: Buffer.from(privateKey.export({ type: "pkcs1", format: "pem" })),
    accountId: "unused",
    apiToken: "unused",
    dataPath: join(directory, "world.lancedb"),
  });
  const client = new Client();
  try {
    await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
    const address = server.address();
    assert.equal(typeof address, "object");
    await new Promise<void>((resolve, reject) => {
      client.once("ready", resolve).once("error", reject).connect({
        host: "127.0.0.1",
        port: typeof address === "object" && address ? address.port : 0,
        username: "ttd",
        password: "test-password",
        hostVerifier: () => true,
      });
    });
    const transcript = await new Promise<string>((resolve, reject) => {
      client.shell((error, stream) => {
        if (error) return reject(error);
        let output = "";
        stream.on("data", (chunk: Buffer) => {
          output += chunk.toString("utf8");
          if (output.includes("ttd: ")) stream.end("exit\r\n");
        });
        stream.once("close", () => resolve(output));
        stream.once("error", reject);
      });
    });
    assert.match(transcript, /ttd: /);
    assert.match(transcript, /再见/);
  } finally {
    client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
