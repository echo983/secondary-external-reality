import type { ProjectionDefinition, ProjectionSnapshot } from "../protocol/types.js";

export const BEDROOM_PROJECTIONS = {
  posture: "entity:self.posture",
  position: "entity:self.position",
  doorOpenState: "entity:door-1.open_state",
  standOutcome: "entity:self.action_outcome.stand_now",
  moveOutcome: "entity:self.action_outcome.move_3m_now",
} as const;

export interface BedroomFixture {
  registry: ProjectionDefinition[];
  committed: ProjectionSnapshot[];
  latentValues: Record<string, string>;
}

export function createBedroomFixture(): BedroomFixture {
  return {
    registry: [
      { address: BEDROOM_PROJECTIONS.posture, state: "known", allowedValues: ["sitting_on_bed_edge", "standing"], value: "sitting_on_bed_edge" },
      { address: BEDROOM_PROJECTIONS.position, state: "known", allowedValues: ["bedside", "doorway"], value: "bedside" },
      { address: BEDROOM_PROJECTIONS.doorOpenState, state: "known", allowedValues: ["closed", "open"], value: "closed" },
      { address: BEDROOM_PROJECTIONS.standOutcome, state: "unknown", allowedValues: ["stable_success", "unstable_success", "failure"] },
      { address: BEDROOM_PROJECTIONS.moveOutcome, state: "unknown", allowedValues: ["normal_success", "impaired_success", "failure"] },
    ],
    committed: [
      { projection: BEDROOM_PROJECTIONS.posture, value: "sitting_on_bed_edge", revision: 0 },
      { projection: BEDROOM_PROJECTIONS.position, value: "bedside", revision: 0 },
      { projection: BEDROOM_PROJECTIONS.doorOpenState, value: "closed", revision: 0 },
    ],
    latentValues: {
      [BEDROOM_PROJECTIONS.standOutcome]: "unstable_success",
      [BEDROOM_PROJECTIONS.moveOutcome]: "impaired_success",
    },
  };
}
