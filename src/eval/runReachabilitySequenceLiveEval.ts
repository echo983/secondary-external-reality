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
import { checkCommitmentClosureTemplates } from "../verification/acceptanceChecks.js";

// Real dual-workstation state sequence for
// docs/MVP-subject-physical-reach-capability-design-v0.7.md §5: hold the pen,
// walk the whole bedroom -> hallway -> living-room chain, and confirm three
// things in one continuous run: (1) an unheld bedroom object (the key, the
// drawer) can no longer be taken/opened/observed from across the apartment;
// (2) the held pen stays observable anywhere, because a held item is always
// reachable; (3) even the held pen cannot be *placed* on a bedroom table from
// the living room — the destination, not the object, is the gate. Walking
// back restores every one of those operations.
const cases = [
  { input: "拿起笔", response: "拿起" },
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到客厅", response: "客厅" },
  { input: "拿起钥匙", response: "", expectReject: true },
  { input: "打开抽屉", response: "", expectReject: true },
  { input: "找钥匙", response: "", expectReject: true },
  { input: "找笔", response: "笔" }, // held item stays reachable anywhere
  { input: "把笔放到桌子上", response: "", expectReject: true }, // destination, not the held object, is the gate
  { input: "走到走廊", response: "走廊" },
  { input: "走到床边", response: "床边" },
  { input: "拿起钥匙", response: "钥匙" },
  { input: "把笔放到桌子上", response: "桌子" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-reachability-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "reachability-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const expectedReject = "expectReject" in item && item.expectReject === true;
      // A reach failure the real model compiles as a locate-style world_query
      // (e.g. "找钥匙" read as "where is the key") is blocked through the
      // pre-existing triageFixedQuery/isEntityPerceivable boundary path
      // instead of throwing — a different TurnResult shape for the same
      // correct outcome (nothing perceived, nothing committed), not a bug.
      const correct = expectedReject ? result.kind === "boundary" && delta === 0
        : result.response.trim().length > 0 && (item.response === "" || result.response.includes(item.response));
      rows.push({ input: item.input, response: result.response, kind: result.kind, delta, correct });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expectedReject = "expectReject" in item && item.expectReject === true;
      rows.push({ input: item.input, kind: "rejected", response: message, delta: (await store.list()).length - before, correct: expectedReject });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const finalPosition = world.entities.get("self")?.attributes.position;
  const keyLocation = world.directLocation("key-1");
  const penLocation = world.directLocation("pen-1");
  const stateCorrect = finalPosition === "bedside" && keyLocation?.predicate === "held_by" && keyLocation.objectId === "self"
    && penLocation?.predicate === "located_on" && penLocation.objectId === "table-1";
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length + closureIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, fatalReplayIssueCount, closureIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
