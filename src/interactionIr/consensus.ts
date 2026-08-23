import type { InteractionEnvelopeV10 } from "./types.js";

function material(proposal: InteractionEnvelopeV10): unknown {
  return {
    inputLanguage: proposal.inputLanguage, speechAct: proposal.speechAct, actuality: proposal.actuality,
    clauses: proposal.clauses.map((clause) => ({ operation: clause.operation === "put_inside" ? "place" : clause.operation,
      queryMode: clause.queryMode === "presence" || clause.queryMode === "value" ? clause.queryMode : null,
      roles: ["look_around", "inventory"].includes(clause.operation) ? []
        : clause.roles.map((role) => ({ role: role.role, mention: role.mention })).sort((a, b) => a.role.localeCompare(b.role) || a.mention.localeCompare(b.mention)) })),
  };
}

export function interactionConsensus(left: InteractionEnvelopeV10, right: InteractionEnvelopeV10): { agreed: boolean; proposal: InteractionEnvelopeV10 | null } {
  return JSON.stringify(material(left)) === JSON.stringify(material(right))
    ? { agreed: true, proposal: structuredClone(left) }
    : { agreed: false, proposal: null };
}
