import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ssh2 from "ssh2";
import { createSshMvpServer } from "../ssh/server.js";

const { Client } = ssh2;
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-live-ssh-"));
const apiToken = (await readFile(process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt", "utf8")).trim();
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const hostKey = Buffer.from(privateKey.export({ type: "pkcs1", format: "pem" }));
const password = `live-${Date.now()}`;
const { server, store } = createSshMvpServer({
  host: "127.0.0.1", port: 0, username: "ttd", password, hostKey,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9",
  apiToken, dataPath: join(directory, "world.lancedb"), actionIrMode: "active",
});

try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SSH server did not expose a TCP address.");
  const output = await new Promise<string>((resolve, reject) => {
    const client = new Client();
    let text = "";
    let prompts = 0;
    const timer = setTimeout(() => { client.end(); reject(new Error("Live SSH evaluation timed out.")); }, 90_000);
    client.on("ready", () => client.shell((error, channel) => {
      if (error) { clearTimeout(timer); reject(error); return; }
      channel.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
        const count = text.split("ttd: ").length - 1;
        if (count > prompts) {
          prompts = count;
          if (prompts === 1) channel.write("我打开抽屉，然后把抽屉关上\n");
          else if (prompts === 2) channel.write("exit\n");
        }
      });
      channel.on("close", () => { clearTimeout(timer); client.end(); resolve(text); });
    }));
    client.on("error", (error) => { clearTimeout(timer); reject(error); });
    client.connect({ host: "127.0.0.1", port: address.port, username: "ttd", password, hostVerifier: () => true });
  });
  const commits = await store.list();
  const audits = await store.listActionProposalAudits();
  process.stdout.write(`${JSON.stringify({ promptCount: output.split("ttd: ").length - 1, commitCount: commits.length,
    auditStatuses: audits.map((audit) => audit.status), selectedCandidateIds: commits.map((commit) => commit.selectedCandidateId),
    responseText: output.replaceAll("ttd: ", "").trim() }, null, 2)}\n`);
  if (commits.length !== 2 || audits.length !== 1 || audits[0]?.status !== "validated") process.exitCode = 1;
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(directory, { recursive: true, force: true });
}
