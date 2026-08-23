import type { ObjectWorldFixture } from "../world/objectFixture.js";
import type { MaterializedWorld } from "../world/materializedWorld.js";
import { primitiveContract } from "./primitiveContracts.js";
import type { ActionProposalEnvelopeV07, ActionRole, ActionStepProposalV07 } from "./types.js";

export type GroundingStatus = "resolved" | "ambiguous" | "missing" | "literal";

export interface GroundedRole {
  role: ActionRole;
  mention: string;
  status: GroundingStatus;
  entityId?: string;
  candidateEntityIds: string[];
  literalValue?: string;
}

export interface GroundedActionStep {
  stepId: string;
  primitive: ActionStepProposalV07["primitive"];
  actor: "self";
  roles: GroundedRole[];
  modifiers: ActionStepProposalV07["modifiers"];
}

export interface GroundingIssue {
  code: "UNKNOWN_ENTITY_REFERENCE" | "AMBIGUOUS_ENTITY_REFERENCE" | "ROLE_CAPABILITY_MISMATCH";
  stepId: string;
  role: ActionRole;
  mention: string;
  candidateEntityIds: string[];
}

export interface GroundingResult {
  ready: boolean;
  exitKind: ActionProposalEnvelopeV07["exitKind"];
  steps: GroundedActionStep[];
  issues: GroundingIssue[];
}

function candidateIds(fixture: ObjectWorldFixture, mention: string): string[] {
  const normalized = mention.toLocaleLowerCase();
  return fixture.names
    .filter((entry) => entry.names.some((name) => normalized.includes(name.toLocaleLowerCase())))
    .map((entry) => entry.entityId)
    .sort();
}

function satisfiesContract(world: MaterializedWorld, entityId: string, roleContract: ReturnType<typeof primitiveContract>["roles"][number]): boolean {
  const entity = world.entities.get(entityId);
  if (!entity) return false;
  if (roleContract.allowedEntityTypes && !roleContract.allowedEntityTypes.includes(entity.entityType)) return false;
  return (roleContract.requiredCapabilities ?? []).every((capability) => entity.attributes[capability] === "true");
}

export function groundActionProposal(
  proposal: ActionProposalEnvelopeV07,
  fixture: ObjectWorldFixture,
  world: MaterializedWorld,
): GroundingResult {
  if (proposal.exitKind !== "actions") return { ready: false, exitKind: proposal.exitKind, steps: [], issues: [] };
  const issues: GroundingIssue[] = [];
  const steps = proposal.steps.map((step): GroundedActionStep => {
    const contract = primitiveContract(step.primitive);
    return {
      stepId: step.stepId,
      primitive: step.primitive,
      actor: step.actor,
      modifiers: structuredClone(step.modifiers),
      roles: step.roles.map((role): GroundedRole => {
        const roleContract = contract.roles.find((candidate) => candidate.role === role.role)!;
        if (roleContract.grounding === "literal") {
          return { role: role.role, mention: role.mention, status: "literal", candidateEntityIds: [], literalValue: role.mention };
        }
        const candidates = candidateIds(fixture, role.mention);
        const capable = candidates.filter((entityId) => satisfiesContract(world, entityId, roleContract));
        if (candidates.length === 0) {
          issues.push({ code: "UNKNOWN_ENTITY_REFERENCE", stepId: step.stepId, role: role.role, mention: role.mention, candidateEntityIds: [] });
          return { role: role.role, mention: role.mention, status: "missing", candidateEntityIds: [] };
        }
        if (capable.length === 0) {
          issues.push({ code: "ROLE_CAPABILITY_MISMATCH", stepId: step.stepId, role: role.role, mention: role.mention, candidateEntityIds: candidates });
          return { role: role.role, mention: role.mention, status: "missing", candidateEntityIds: candidates };
        }
        if (capable.length > 1) {
          issues.push({ code: "AMBIGUOUS_ENTITY_REFERENCE", stepId: step.stepId, role: role.role, mention: role.mention, candidateEntityIds: capable });
          return { role: role.role, mention: role.mention, status: "ambiguous", candidateEntityIds: capable };
        }
        return { role: role.role, mention: role.mention, status: "resolved", entityId: capable[0]!, candidateEntityIds: capable };
      }),
    };
  });
  return { ready: issues.length === 0, exitKind: proposal.exitKind, steps, issues };
}
