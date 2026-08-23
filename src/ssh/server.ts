import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import ssh2 from "ssh2";
import type { AuthContext, Server as SshServer, ServerChannel } from "ssh2";
import { DualRoleBedroomJury, KernelAwareBedroomJury, WorkersAiBedroomJury, WorkersAiTurnRenderer } from "../ai/bedroomAdapters.js";
import { WorkersAiClient } from "../ai/workersAiClient.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer } from "../turn/bedroomTurn.js";
import { TtdTextShell } from "./textShell.js";
import { WorkersAiActionIrProposer } from "../actionIr/proposer.js";
import { WorkersAiActionIrSemanticAuditor } from "../actionIr/semanticAuditor.js";
import { WorkersAiSemanticIrAuditor, WorkersAiSemanticIrProposer } from "../semanticIr/adapters.js";

const { Server } = ssh2;

export interface SshMvpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  hostKey: Buffer;
  accountId: string;
  apiToken: string;
  dataPath: string;
  actionIrMode?: "off" | "shadow" | "active";
}

function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSshMvpServer(config: SshMvpConfig): { server: SshServer; store: LanceCommitStore } {
  const client = new WorkersAiClient({ accountId: config.accountId, apiToken: config.apiToken });
  const store = new LanceCommitStore(config.dataPath);
  const session = new BedroomSession({
    sessionId: "ssh-world",
    store,
    jury: new KernelAwareBedroomJury(new DualRoleBedroomJury(
      new WorkersAiBedroomJury(client, "world_causality"),
      new WorkersAiBedroomJury(client, "experience_epistemic"),
    )),
    renderer: new WorkersAiTurnRenderer(client, new ChineseBedroomRenderer()),
    actionIr: {
      mode: config.actionIrMode ?? "off",
      proposer: new WorkersAiActionIrProposer(client),
      semanticAuditor: new WorkersAiActionIrSemanticAuditor(client),
    },
    semanticIr: { proposer: new WorkersAiSemanticIrProposer(client), auditor: new WorkersAiSemanticIrAuditor(client) },
  });
  const server = new Server({ hostKeys: [config.hostKey] }, (connection) => {
    connection.on("authentication", (context: AuthContext) => {
      if (context.method === "password" && context.username === config.username && equalSecret(context.password, config.password)) context.accept();
      else context.reject(["password"]);
    });
    connection.on("ready", () => {
      connection.on("session", (accept) => {
        const sshSession = accept();
        sshSession.on("pty", (acceptPty) => acceptPty());
        sshSession.once("shell", (acceptShell) => {
          const channel: ServerChannel = acceptShell();
          const shell = new TtdTextShell(session, channel);
          channel.on("data", (data: Buffer) => shell.receive(data));
          shell.start();
        });
      });
    });
  });
  server.on("close", () => store.close());
  return { server, store };
}

async function requiredFile(path: string | undefined, label: string): Promise<Buffer> {
  if (!path) throw new Error(`${label} path is required.`);
  return readFile(path);
}

export async function startSshMvpFromEnvironment(): Promise<SshServer> {
  const hostKey = await requiredFile(process.env.SER_SSH_HOST_KEY_PATH, "SSH host key");
  const password = (await requiredFile(process.env.SER_SSH_PASSWORD_FILE, "SSH password file")).toString("utf8").trim();
  const tokenPath = process.env.CLOUDFLARE_API_TOKEN_FILE ?? "secret/cftoken.txt";
  const apiToken = (await readFile(tokenPath, "utf8")).trim();
  if (!password || !apiToken) throw new Error("Password and Cloudflare token must be non-empty.");
  const port = Number(process.env.SER_SSH_PORT ?? "2222");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("SER_SSH_PORT must be a valid TCP port.");
  const actionIrMode = process.env.SER_ACTION_IR_MODE ?? "off";
  if (actionIrMode !== "off" && actionIrMode !== "shadow" && actionIrMode !== "active") throw new Error("SER_ACTION_IR_MODE must be off, shadow, or active.");
  const { server } = createSshMvpServer({
    host: process.env.SER_SSH_HOST ?? "127.0.0.1",
    port,
    username: process.env.SER_SSH_USER ?? "ttd",
    password,
    hostKey,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "00f6c85f82f6297c8c0bef9460e013d9",
    apiToken,
    dataPath: process.env.SER_DATA_PATH ?? ".world/world.lancedb",
    actionIrMode,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, process.env.SER_SSH_HOST ?? "127.0.0.1", resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  startSshMvpFromEnvironment()
    .then((server) => {
      const address = server.address();
      process.stdout.write(`SSH MVP listening on ${typeof address === "string" ? address : `${address?.address}:${address?.port}`}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
