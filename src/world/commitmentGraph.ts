import type { ReplayIssue } from "../epistemic/types.js";
import type { LegacyFixedProjection, LegacyProjectionClassification } from "./commitmentTypes.js";
import type { SemanticAddress } from "./semanticAddress.js";

export interface CommitmentGraphBuild {
  view: CommitmentGraphView;
  issues: ReplayIssue[];
}

export class CommitmentGraphView {
  private readonly bySource: Map<string, LegacyFixedProjection>;
  private readonly byCanonical: Map<SemanticAddress, LegacyFixedProjection[]>;

  constructor(projections: readonly LegacyFixedProjection[]) {
    this.bySource = new Map();
    this.byCanonical = new Map();
    for (const projection of projections) {
      if (!this.bySource.has(projection.sourceAddress)) this.bySource.set(projection.sourceAddress, structuredClone(projection));
      if (projection.canonicalAddress) {
        const values = this.byCanonical.get(projection.canonicalAddress) ?? [];
        values.push(structuredClone(projection));
        this.byCanonical.set(projection.canonicalAddress, values);
      }
    }
  }

  legacyBySource(sourceAddress: string): LegacyFixedProjection | undefined {
    const value = this.bySource.get(sourceAddress);
    return value ? structuredClone(value) : undefined;
  }

  legacyByCanonical(address: SemanticAddress): LegacyFixedProjection[] {
    return structuredClone(this.byCanonical.get(address) ?? []);
  }

  byClassification(classification: LegacyProjectionClassification): LegacyFixedProjection[] {
    return structuredClone([...this.bySource.values()].filter((value) => value.classification === classification));
  }

  allLegacy(): LegacyFixedProjection[] {
    return structuredClone([...this.bySource.values()]);
  }
}

export function buildCommitmentGraph(projections: readonly LegacyFixedProjection[]): CommitmentGraphBuild {
  const issues: ReplayIssue[] = [];
  const fixed = new Map<string, LegacyFixedProjection>();
  for (const [index, projection] of projections.entries()) {
    const existing = fixed.get(projection.sourceAddress);
    if (existing && JSON.stringify(existing.value) !== JSON.stringify(projection.value)) {
      issues.push({
        code: "LEGACY_FIXED_VALUE_CONFLICT",
        path: `legacyFixedProjections[${index}].value`,
        message: `Legacy projection ${projection.sourceAddress} has conflicting fixed values.`,
        fatal: true,
      });
      continue;
    }
    if (!existing) fixed.set(projection.sourceAddress, structuredClone(projection));
  }
  return { view: new CommitmentGraphView([...fixed.values()]), issues };
}
