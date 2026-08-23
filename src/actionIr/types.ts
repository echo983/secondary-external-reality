export const ACTION_IR_SCHEMA_VERSION = "0.8.0" as const;

export const ACTION_PRIMITIVES = [
  "take",
  "place",
  "put_inside",
  "open",
  "close",
  "observe",
  "open_and_observe",
  "write_and_hide",
  "read",
  "look_around",
  "inspect_contents",
  "locate",
  "inventory",
] as const;

export type ActionPrimitive = (typeof ACTION_PRIMITIVES)[number];

export const ACTION_ROLES = ["target", "destination", "instrument", "content"] as const;
export type ActionRole = (typeof ACTION_ROLES)[number];

export const ACTION_EFFORTS = ["gentle", "normal", "forceful"] as const;
export type ActionEffort = (typeof ACTION_EFFORTS)[number];

export const ACTION_MANNERS = ["careful", "normal", "hurried"] as const;
export type ActionManner = (typeof ACTION_MANNERS)[number];

export const ACTION_PROPOSAL_EXITS = ["actions", "unsupported_action", "not_an_action"] as const;
export type ActionProposalExit = (typeof ACTION_PROPOSAL_EXITS)[number];

export interface ActionRoleProposalV07 {
  role: ActionRole;
  mention: string;
}

export interface ActionModifiersV07 {
  effort?: ActionEffort;
  manner?: ActionManner;
}

export interface ActionStepProposalV07 {
  stepId: string;
  primitive: ActionPrimitive;
  actor: "self";
  roles: ActionRoleProposalV07[];
  modifiers: ActionModifiersV07;
}

export interface ActionProposalEnvelopeV07 {
  schemaVersion: typeof ACTION_IR_SCHEMA_VERSION;
  inputLanguage: "zh" | "en";
  exitKind: ActionProposalExit;
  steps: ActionStepProposalV07[];
}

export interface ActionIrValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ActionIrValidationResult {
  valid: boolean;
  issues: ActionIrValidationIssue[];
  proposal: ActionProposalEnvelopeV07 | null;
}
