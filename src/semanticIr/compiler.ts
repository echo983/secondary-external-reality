import type { ObjectIntent } from "../world/objectIntent.js";
import { resolveFixtureEntity, type ObjectWorldFixture } from "../world/objectFixture.js";
import type { MaterializedWorld } from "../world/materializedWorld.js";
import type { SemanticIntentV09 } from "./types.js";

export type SemanticCompileCode = "NEGATED_OR_NON_ACTUAL" | "REFERENCE_MISSING" | "REFERENCE_AMBIGUOUS" | "TARGET_NOT_VISIBLE" | "CAPABILITY_NOT_REGISTERED";
export class SemanticCompileError extends Error { constructor(readonly code: SemanticCompileCode) { super(code); } }
export interface ExecutableIntentV09 { capabilityId: string; objectIntent: ObjectIntent; mentionedEntityIds: string[] }

export function compileSemanticIntent(intent: SemanticIntentV09, rawTtd: string, language: "zh" | "en", fixture: ObjectWorldFixture, world: MaterializedWorld): ExecutableIntentV09 {
  if (intent.modifiers.negated || intent.modifiers.hypothetical || intent.modifiers.conditional) throw new SemanticCompileError("NEGATED_OR_NON_ACTUAL");
  if (intent.kind === "query" && intent.query?.mode === "inventory") return { capabilityId: "query.inventory", objectIntent: { operation: "inventory", rawTtd, inputLanguage: language }, mentionedEntityIds: [] };
  const targetMention = intent.references.find((ref) => ref.role === "target")?.mention;
  const ids = targetMention ? resolveFixtureEntity(fixture, targetMention) : [];
  if (targetMention && ids.length === 0) throw new SemanticCompileError("REFERENCE_MISSING");
  if (ids.length > 1) throw new SemanticCompileError("REFERENCE_AMBIGUOUS");
  const target = ids[0] ? world.entities.get(ids[0]) : undefined;
  let operation: ObjectIntent["operation"] | null = null;
  let capabilityId = "";
  if (intent.kind === "query" && intent.query?.mode === "location" && target) { operation = "locate"; capabilityId = "query.location"; }
  else if (intent.kind === "query" && intent.query?.mode === "contents" && target?.attributes.container === "true") { operation = "inspect_contents"; capabilityId = "query.contents"; }
  else if (intent.kind === "query" && ["presence", "value"].includes(intent.query?.mode ?? "") && target?.entityType === "paper_note" && /字|写|inscription|written|writing|text/iu.test(intent.query?.aspectMention ?? rawTtd)) {
    operation = intent.query!.mode === "presence" ? "inspect_inscription_presence" : "inspect_inscription_value";
    capabilityId = `query.inscription.${intent.query!.mode}`;
  } else if ((intent.kind === "perceive" || (intent.kind === "act" && /看|观察|look|inspect|observe/iu.test(intent.verbPhrase))) && target) { operation = "observe"; capabilityId = "perceive.entity"; }
  if (!operation) throw new SemanticCompileError("CAPABILITY_NOT_REGISTERED");
  return { capabilityId, objectIntent: { operation, rawTtd, inputLanguage: language }, mentionedEntityIds: ids };
}
