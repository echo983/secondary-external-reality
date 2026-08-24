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
import { checkCommitmentClosureTemplates, checkQueryConfluence, type QueryConfluenceRun } from "../verification/acceptanceChecks.js";

// Real dual-workstation state sequence for
// docs/MVP-testimony-multi-agent-aeg-design-v1.0.md §5: write the note (the
// roommate, statically anchored to the bedroom, independently witnesses this
// the moment it happens, regardless of whether self ever reads it), self
// reads it directly too, then a filler loop through hallway/living room long
// enough to fade self's own recollection (already proven), and confirm
// testimony still recovers the value afterward. A Query Confluence probe
// checks the value self read directly (index 2) agrees with the value
// relayed as testimony (index 11) — two independent epistemic paths to the
// same already-fixed fact.
const cases = [
  { input: "拿起笔", response: "拿起" },
  { input: "我向空白便签写42", response: "42" }, // left openly on the nightstand, not hidden under the pillow (write_and_hide is unreliable through the active interaction IR pipeline — see docs/MVP-observation-bandwidth-design-v0.8.md's live eval for the same substitution)
  { input: "纸条上写着什么", response: "42" }, // self's own direct read
  { input: "打开门", response: "打开" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到客厅", response: "客厅" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到客厅", response: "客厅" },
  { input: "走到走廊", response: "走廊" },
  { input: "走到床边", response: "床边" },
  { input: "我还记得纸条上写的是什么吗", response: "记不清" }, // self's own recollection has faded
  { input: "问室友纸条上写的是什么", response: "42" }, // testimony is unaffected by self's own decay
] as const;

const client = await createLiveEvalClient();
const directory = await mkdtemp(join(tmpdir(), "secondary-reality-testimony-sequence-"));
const store = new LanceCommitStore(join(directory, "world.lancedb"));
const session = new BedroomSession({ sessionId: "testimony-sequence", store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer(),
  interactionIr: { mode: "active", left: new WorkersAiInteractionWorkstation(client, "linguist"), right: new WorkersAiInteractionWorkstation(client, "safety_analyst") } });
const rows: Array<Record<string, unknown>> = [];
const confluenceRuns: QueryConfluenceRun[] = [];
try {
  for (const [index, item] of cases.entries()) {
    const before = (await store.list()).length;
    const result = await session.submit(item.input);
    const delta = (await store.list()).length - before;
    const nonEmpty = result.response.trim().length > 0;
    const textCorrect = result.response.includes(item.response);
    rows.push({ input: item.input, response: result.response, kind: result.kind, delta, correct: nonEmpty && textCorrect });
    // index 2 = direct read; index 11 = testimony relay — two independent
    // paths to the same already-fixed inscription value.
    if (index === 2 || index === 11) {
      const facts = result.kind === "committed" && "commitPackage" in result
        ? [{ subject: "blank-note-1", predicate: "inscription", value: String(result.commitPackage.evidenceGenerated?.find((entry) => entry.attribute === "inscription")?.value ?? "") }]
        : [];
      confluenceRuns.push({ probeGroup: "note-inscription", orderingLabel: item.input, revealedFacts: facts });
    }
  }
  const commits = await store.list();
  const fixture = createObjectWorldFixture();
  const world = MaterializedWorld.replay(commits, fixture.seedCommitments);
  const replay = replayCanonicalViews(commits, { seedCommitments: fixture.seedCommitments, mode: "diagnostic" });
  const closureIssues = checkCommitmentClosureTemplates(commits);
  const confluenceIssues = checkQueryConfluence(confluenceRuns);
  const inscription = world.entities.get("blank-note-1")?.attributes.inscription;
  const stateCorrect = inscription === "42";
  const fatalReplayIssueCount = replay.issues.filter((issue) => issue.fatal).length
    + closureIssues.filter((issue) => issue.severity === "fatal").length
    + confluenceIssues.filter((issue) => issue.severity === "fatal").length;
  const passed = rows.filter((row) => row.correct).length;
  process.stdout.write(`${JSON.stringify({ passed, total: rows.length, stateCorrect, fatalReplayIssueCount, confluenceIssues, closureIssues, rows }, null, 2)}\n`);
  process.exitCode = passed === rows.length && stateCorrect && fatalReplayIssueCount === 0 ? 0 : 1;
} finally { store.close(); await rm(directory, { recursive: true, force: true }); }
