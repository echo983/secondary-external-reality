import type { ObjectIntent } from "../world/objectIntent.js";
import type { GroundedActionStep } from "./grounding.js";

export interface CompiledObjectAction {
  intent: ObjectIntent;
  mentionedEntityIds: string[];
}

export class ActionIrCompileError extends Error {}

export function compileGroundedAction(step: GroundedActionStep, rawTtd: string, inputLanguage: "zh" | "en"): CompiledObjectAction {
  if (step.roles.some((role) => role.status !== "resolved" && role.status !== "literal")) {
    throw new ActionIrCompileError(`Step ${step.stepId} is not fully grounded.`);
  }
  const mentionedEntityIds = [...new Set(step.roles.flatMap((role) => role.entityId ? [role.entityId] : []))].sort();
  return {
    intent: { operation: step.primitive, rawTtd, inputLanguage },
    mentionedEntityIds,
  };
}
