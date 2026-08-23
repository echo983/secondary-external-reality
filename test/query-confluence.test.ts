import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanceCommitStore } from "../src/storage/lanceCommitStore.js";
import { BedroomSession } from "../src/turn/bedroomSession.js";
import { ChineseBedroomRenderer, PassingBedroomJury } from "../src/turn/bedroomTurn.js";
import { checkQueryConfluence, type QueryConfluenceRun } from "../src/verification/acceptanceChecks.js";
import type { EvidenceRecord } from "../src/protocol/types.js";

function extractFacts(evidence: readonly EvidenceRecord[] | undefined): QueryConfluenceRun["revealedFacts"] {
  return (evidence ?? []).map((entry) => ({
    subject: entry.subjectId,
    predicate: entry.kind === "attribute_observed" ? (entry.attribute ?? "") : (entry.predicate ?? entry.kind),
    value: entry.kind === "attribute_observed" ? (entry.value ?? "") : (entry.objectId ?? ""),
  }));
}

// Zero-LLM-cost programmatic version of V1 Query Confluence: the same three
// read-only queries, run in three different orderings from an identical
// setup, must each reveal the same fact regardless of what ran before them.
test("read-only queries reveal the same facts regardless of the order they run in", async () => {
  const orderings: Array<{ label: string; order: string[] }> = [
    { label: "locate-contents-position", order: ["钥匙在哪里", "抽屉里有什么", "我在哪里"] },
    { label: "position-locate-contents", order: ["我在哪里", "钥匙在哪里", "抽屉里有什么"] },
    { label: "contents-position-locate", order: ["抽屉里有什么", "我在哪里", "钥匙在哪里"] },
  ];

  const runs: QueryConfluenceRun[] = [];
  for (const { label, order } of orderings) {
    const directory = await mkdtemp(join(tmpdir(), "secondary-reality-confluence-"));
    const store = new LanceCommitStore(join(directory, "world.lancedb"));
    try {
      const session = new BedroomSession({ sessionId: `confluence-${label}`, store, jury: new PassingBedroomJury(), renderer: new ChineseBedroomRenderer() });
      await session.submit("打开抽屉");
      await session.submit("拿起钥匙");
      await session.submit("把钥匙放进抽屉");
      for (const input of order) {
        const result = await session.submit(input);
        if (result.kind !== "committed") throw new Error(`Expected "${input}" to commit under ordering "${label}", got ${result.kind}`);
        runs.push({ probeGroup: input, orderingLabel: label, revealedFacts: extractFacts(result.commitPackage.evidenceGenerated) });
      }
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  }

  assert.deepEqual(checkQueryConfluence(runs), []);
});

test("query confluence check actually rejects a genuine divergence", () => {
  const runs: QueryConfluenceRun[] = [
    { probeGroup: "钥匙在哪", orderingLabel: "a", revealedFacts: [{ subject: "key-1", predicate: "contained_by", value: "drawer-1" }] },
    { probeGroup: "钥匙在哪", orderingLabel: "b", revealedFacts: [{ subject: "key-1", predicate: "located_on", value: "table-1" }] },
  ];
  const issues = checkQueryConfluence(runs);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "QUERY_CONFLUENCE_VIOLATION");
});
