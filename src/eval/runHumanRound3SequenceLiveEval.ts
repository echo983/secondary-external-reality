import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveEvalClient } from "./liveEvalHarness.js";
import { WorkersAiInteractionWorkstation } from "../interactionIr/workstations.js";
import { replayCanonicalViews } from "../replay/canonicalReplay.js";
import { LanceCommitStore } from "../storage/lanceCommitStore.js";
import { BedroomSession } from "../turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../turn/bedroomTurn.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { MaterializedWorld } from "../world/materializedWorld.js";

const cases = [
  { input: "看看周围", kind: "committed", delta: 1, response: "床" },
  { input: "笔在哪里", kind: "committed", delta: 1, response: "床头柜" },
  { input: "我手里有什么", kind: "committed", delta: 1, response: "没有" },
  { input: "打开门", kind: "committed", delta: 1, response: "打开了门" },
  // Door was opened by the previous step, so "门外" now resolves to the real
  // hallway-1 Place entity. Every committed turn in this suite adds exactly
  // one row to the store regardless of whether it wrote new WorldTruth (see
  // e.g. "我手里有什么" above, also delta 1 with zero world commitments) — so
  // both queries show delta 1 here; what must NOT repeat is the underlying
  // notable_feature attribute_set itself, which this suite doesn't inspect
  // directly but test/object-turn.test.ts does (commitPackage.newWorldCommitments).
  { input: "看看门外", kind: "committed", delta: 1 },
  { input: "门外有什么", kind: "committed", delta: 1 },
  { input: "走到门口", kind: "committed", delta: 1, response: "门口" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-human-round3-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "human-round3-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    const result = await session.submit(item.input);
    const delta = (await store.list()).length - before;
    const audit = (await store.listInteractionIrAudits()).at(-1);
    const codeCorrect = !("code" in item) || (result.kind === "interface" && result.code === item.code);
    const responseCorrect = !("response" in item) || result.response.includes(item.response);
    rows.push({ input: item.input, response: result.response, expectedKind: item.kind, actualKind: result.kind,
      expectedCommitDelta: item.delta, actualCommitDelta: delta, ...(result.kind === "interface" ? { code: result.code } : {}),
      auditStatus: audit?.status, proposal: audit?.proposal, correct: result.kind === item.kind && delta === item.delta && codeCorrect && responseCorrect && audit?.status === "agreed" });
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const finalState = { penLocation: world.directLocation("pen-1")?.objectId, heldEntityIds: world.entitiesRelatedTo("held_by", "self").map((entity) => entity.entityId),
    doorOpenState: world.entities.get("door-1")?.attributes.open_state, selfPosition: world.entities.get("self")?.attributes.position };
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length;
  const passed = rows.filter((row) => row.correct).length;
  const stateCorrect = finalState.penLocation === "nightstand-1" && finalState.heldEntityIds.length === 0 && finalState.doorOpenState === "open" && finalState.selfPosition === "doorway";
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, fatalReplayIssueCount, finalState, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
