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
// docs/MVP-observation-bandwidth-design-v0.8.md §5: read the note's exact
// content from bedside (fine), walk to the doorway — still the same
// "bedroom" room as bedside, so still room-perceivable — and confirm exact
// content is now blocked while presence/existence stay answerable, then walk
// back and confirm exact reading is restored. Distinguishes this from the
// physical-reach milestone (a different room entirely) by staying inside the
// bedroom the whole time.
const cases = [
  { input: "拿起笔", response: "拿起" },
  { input: "我向空白便签写42", response: "42" }, // left openly on the nightstand, not hidden under the pillow
  { input: "纸条上写着什么", response: "42" },
  { input: "走到门口", response: "门口" },
  { input: "纸条上写着什么", response: "", expectReject: true }, // out of observation bandwidth
  { input: "纸条在哪里", response: "" }, // existence/location stays coarse-grained, answerable from the doorway
  { input: "走到床边", response: "床边" },
  { input: "纸条上写着什么", response: "42" },
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-observation-bandwidth-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "observation-bandwidth-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const before = (await store.list()).length;
    try {
      const result = await session.submit(item.input);
      const delta = (await store.list()).length - before;
      const expectedReject = "expectReject" in item && item.expectReject === true;
      // Bandwidth failures compiled as a query naturally come back as a
      // boundary (this milestone's own new path), not a thrown exception —
      // accept either shape as long as nothing committed, matching the
      // reachability suite's precedent for the same kind of ambiguity.
      const correct = expectedReject ? result.kind === "boundary" && delta === 0
        : result.kind === "committed" && result.response.trim().length > 0 && (item.response === "" || result.response.includes(item.response));
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
  const inscription = world.entities.get("blank-note-1")?.attributes.inscription;
  const stateCorrect = finalPosition === "bedside" && inscription === "42";
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length + closureIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, fatalReplayIssueCount, closureIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
