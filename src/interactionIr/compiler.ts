import type { InteractionEnvelopeV10, InteractionRole } from "./types.js";
import type { ObjectIntent, ObjectOperationKind } from "../world/objectIntent.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { ReferenceLexicon } from "../world/referenceLexicon.js";

export type InteractionCompileIssueCode = "MISSING_TARGET" | "MISSING_DESTINATION" | "AMBIGUOUS_REFERENCE" | "UNRESOLVED_REFERENCE" | "INVALID_LITERAL" | "UNSUPPORTED_OPERATION";
export type CompiledInteraction =
  | { kind: "executable"; steps: Array<{ objectIntent: ObjectIntent; mentionedEntityIds: string[] }> }
  | { kind: "clarification"; code: InteractionCompileIssueCode };

const operationMap: Partial<Record<InteractionEnvelopeV10["clauses"][number]["operation"], ObjectOperationKind>> = {
  take: "take", place: "place", put_inside: "put_inside", open: "open", close: "close", observe: "observe",
  write: "write", read: "read", look_around: "look_around", inspect_contents: "inspect_contents", locate: "locate", inventory: "inventory",
  move: "move",
};

function rolesOf(clause: InteractionEnvelopeV10["clauses"][number], role: InteractionRole): string[] {
  return clause.roles.filter((item) => item.role === role).map((item) => item.mention);
}

export function compileInteraction(proposal: InteractionEnvelopeV10, rawTtd: string): CompiledInteraction {
  const lexicon = new ReferenceLexicon(createObjectWorldFixture());
  const steps: Array<{ objectIntent: ObjectIntent; mentionedEntityIds: string[] }> = [];
  for (const clause of proposal.clauses) {
    const queriedAttributeOperation: ObjectOperationKind | undefined = proposal.speechAct === "world_query" && clause.queryMode === "presence"
      ? "inspect_inscription_presence"
      : proposal.speechAct === "world_query" && clause.queryMode === "value" ? "inspect_inscription_value" : undefined;
    const operation = queriedAttributeOperation ?? operationMap[clause.operation];
    if (!operation) return { kind: "clarification", code: "UNSUPPORTED_OPERATION" };
    const targetMentions = rolesOf(clause, "target");
    const destinationMentions = rolesOf(clause, "destination");
    if (!["look_around", "inventory", "move"].includes(operation) && targetMentions.length === 0) return { kind: "clarification", code: "MISSING_TARGET" };
    if (["place", "put_inside", "move"].includes(operation) && destinationMentions.length === 0) return { kind: "clarification", code: "MISSING_DESTINATION" };
    const mentionedEntityIds: string[] = [];
    let placementRelation: "inside" | "on" | undefined;
    const boundMentions = ["look_around", "inventory"].includes(operation)
      ? [] : [...targetMentions.map((mention) => ({ mention, destination: false })),
        ...destinationMentions.map((mention) => ({ mention, destination: true })),
        ...rolesOf(clause, "instrument").map((mention) => ({ mention, destination: false }))];
    for (const binding of boundMentions) {
      const spatial = binding.destination ? lexicon.resolveSpatialMention(binding.mention) : { entityIds: lexicon.resolveExactMention(binding.mention) };
      const matches = spatial.entityIds;
      if (matches.length !== 1) return { kind: "clarification", code: matches.length > 1 ? "AMBIGUOUS_REFERENCE" : "UNRESOLVED_REFERENCE" };
      if (!mentionedEntityIds.includes(matches[0]!)) mentionedEntityIds.push(matches[0]!);
      if (spatial.relation) {
        if (placementRelation && placementRelation !== spatial.relation) return { kind: "clarification", code: "AMBIGUOUS_REFERENCE" };
        placementRelation = spatial.relation;
      }
    }
    let content: string | undefined;
    if (operation === "write") {
      const contents = rolesOf(clause, "content");
      if (contents.length !== 1 || !/^[0-9]{1,64}$/u.test(contents[0]!.trim())) return { kind: "clarification", code: "INVALID_LITERAL" };
      content = contents[0]!.trim();
    }
    const compiledOperation = operation === "place" && placementRelation === "inside" ? "put_inside" : operation;
    steps.push({ objectIntent: { operation: compiledOperation, rawTtd, inputLanguage: proposal.inputLanguage,
      ...(content ? { content } : {}), ...(placementRelation ? { placementRelation } : {}) }, mentionedEntityIds });
  }
  if (steps.length === 0) return { kind: "clarification", code: "UNSUPPORTED_OPERATION" };
  return { kind: "executable", steps };
}
