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
    if (!["look_around", "inventory"].includes(operation) && targetMentions.length === 0) return { kind: "clarification", code: "MISSING_TARGET" };
    if (["place", "put_inside"].includes(operation) && destinationMentions.length === 0) return { kind: "clarification", code: "MISSING_DESTINATION" };
    const mentionedEntityIds: string[] = [];
    for (const mention of [...targetMentions, ...destinationMentions, ...rolesOf(clause, "instrument")]) {
      const matches = lexicon.resolveExactMention(mention);
      if (matches.length !== 1) return { kind: "clarification", code: matches.length > 1 ? "AMBIGUOUS_REFERENCE" : "UNRESOLVED_REFERENCE" };
      if (!mentionedEntityIds.includes(matches[0]!)) mentionedEntityIds.push(matches[0]!);
    }
    let content: string | undefined;
    if (operation === "write") {
      const contents = rolesOf(clause, "content");
      if (contents.length !== 1 || !/^[0-9]{1,64}$/u.test(contents[0]!.trim())) return { kind: "clarification", code: "INVALID_LITERAL" };
      content = contents[0]!.trim();
    }
    steps.push({ objectIntent: { operation, rawTtd, inputLanguage: proposal.inputLanguage, ...(content ? { content } : {}) }, mentionedEntityIds });
  }
  if (steps.length === 0) return { kind: "clarification", code: "UNSUPPORTED_OPERATION" };
  return { kind: "executable", steps };
}
