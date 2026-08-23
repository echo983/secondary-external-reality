import type { ProjectionDefinition, ProjectionSnapshot } from "../protocol/types.js";

export class ProjectionResolutionError extends Error {}

export class FiniteDomainProjectionResolver {
  private readonly definitions: Map<string, ProjectionDefinition>;
  private readonly snapshots: Map<string, ProjectionSnapshot>;

  constructor(
    registry: readonly ProjectionDefinition[],
    committed: readonly ProjectionSnapshot[],
    private readonly latentValues: Readonly<Record<string, string>>,
  ) {
    this.definitions = new Map(registry.map((definition) => [definition.address, { ...definition }]));
    this.snapshots = new Map(committed.map((snapshot) => [snapshot.projection, { ...snapshot }]));
  }

  resolve(projection: string): ProjectionSnapshot {
    const existing = this.snapshots.get(projection);
    if (existing) return { ...existing };
    const definition = this.definitions.get(projection);
    if (!definition) throw new ProjectionResolutionError(`Unknown projection: ${projection}`);
    if (definition.state === "unsupported") throw new ProjectionResolutionError(`Unsupported projection: ${projection}`);
    const value = this.latentValues[projection];
    if (value === undefined || !definition.allowedValues.includes(value)) {
      throw new ProjectionResolutionError(`No lawful latent value for: ${projection}`);
    }
    const snapshot = { projection, value, revision: 1 };
    this.snapshots.set(projection, snapshot);
    definition.state = "known";
    definition.value = value;
    return { ...snapshot };
  }

  resolveMany(projections: readonly string[]): ProjectionSnapshot[] {
    return [...new Set(projections)].sort().map((projection) => this.resolve(projection));
  }

  allSnapshots(): ProjectionSnapshot[] {
    return [...this.snapshots.values()].map((snapshot) => ({ ...snapshot }));
  }
}
