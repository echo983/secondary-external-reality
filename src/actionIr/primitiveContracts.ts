import type { ActionPrimitive, ActionRole } from "./types.js";

export interface PrimitiveRoleContract {
  role: ActionRole;
  required: boolean;
  grounding: "entity" | "literal";
  requiredCapabilities?: readonly string[];
  allowedEntityTypes?: readonly string[];
  literalKind?: "digits_1_64";
}

export interface PrimitiveContract {
  primitive: ActionPrimitive;
  roles: readonly PrimitiveRoleContract[];
}

export const PRIMITIVE_CONTRACTS: Readonly<Record<ActionPrimitive, PrimitiveContract>> = {
  take: {
    primitive: "take",
    roles: [{ role: "target", required: true, grounding: "entity", requiredCapabilities: ["portable"] }],
  },
  place: {
    primitive: "place",
    roles: [
      { role: "target", required: true, grounding: "entity", requiredCapabilities: ["portable"] },
      { role: "destination", required: true, grounding: "entity", requiredCapabilities: ["surface"] },
    ],
  },
  put_inside: {
    primitive: "put_inside",
    roles: [
      { role: "target", required: true, grounding: "entity", requiredCapabilities: ["portable"] },
      { role: "destination", required: true, grounding: "entity", requiredCapabilities: ["container"] },
    ],
  },
  open: {
    primitive: "open",
    roles: [{ role: "target", required: true, grounding: "entity", requiredCapabilities: ["openable"] }],
  },
  close: {
    primitive: "close",
    roles: [{ role: "target", required: true, grounding: "entity", requiredCapabilities: ["openable"] }],
  },
  observe: {
    primitive: "observe",
    roles: [{ role: "target", required: true, grounding: "entity" }],
  },
  open_and_observe: {
    primitive: "open_and_observe",
    roles: [
      { role: "target", required: true, grounding: "entity" },
      { role: "destination", required: true, grounding: "entity", requiredCapabilities: ["openable", "container"] },
    ],
  },
  write_and_hide: {
    primitive: "write_and_hide",
    roles: [
      { role: "target", required: true, grounding: "entity", allowedEntityTypes: ["paper_note"] },
      { role: "destination", required: true, grounding: "entity", allowedEntityTypes: ["pillow"] },
      { role: "instrument", required: false, grounding: "entity", allowedEntityTypes: ["pen"] },
      { role: "content", required: true, grounding: "literal", literalKind: "digits_1_64" },
    ],
  },
  read: {
    primitive: "read",
    roles: [{ role: "target", required: true, grounding: "entity", allowedEntityTypes: ["paper_note", "pillow"] }],
  },
};

export function primitiveContract(primitive: ActionPrimitive): PrimitiveContract {
  return PRIMITIVE_CONTRACTS[primitive];
}
