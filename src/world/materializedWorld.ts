import type { CommitPackage, WorldCommitment } from "../protocol/types.js";

export interface MaterializedEntity {
  entityId: string;
  entityType: string;
  attributes: Record<string, string>;
  createdAtSequence: number;
}

export interface MaterializedRelation {
  subjectId: string;
  predicate: string;
  objectId: string;
  setAtSequence: number;
}

export class MaterializedWorldError extends Error {}

export class MaterializedWorld {
  readonly entities = new Map<string, MaterializedEntity>();
  readonly relations = new Map<string, MaterializedRelation>();

  static replay(commits: readonly CommitPackage[]): MaterializedWorld {
    const world = new MaterializedWorld();
    for (const commit of [...commits].sort((left, right) => left.commitSequence - right.commitSequence)) {
      for (const commitment of commit.newWorldCommitments) world.apply(commitment, commit.commitSequence);
    }
    return world;
  }

  entitiesRelatedTo(predicate: string, objectId: string): MaterializedEntity[] {
    return [...this.relations.values()]
      .filter((relation) => relation.predicate === predicate && relation.objectId === objectId)
      .map((relation) => this.entities.get(relation.subjectId))
      .filter((entity): entity is MaterializedEntity => entity !== undefined)
      .sort((left, right) => left.createdAtSequence - right.createdAtSequence);
  }

  private apply(commitment: WorldCommitment, commitSequence: number): void {
    if (commitment.kind === "entity_created") {
      if (this.entities.has(commitment.entityId)) throw new MaterializedWorldError(`Entity ${commitment.entityId} was created twice.`);
      this.entities.set(commitment.entityId, { entityId: commitment.entityId, entityType: commitment.entityType, attributes: {}, createdAtSequence: commitSequence });
      return;
    }
    if (commitment.kind === "attribute_set") {
      const entity = this.entities.get(commitment.entityId);
      if (!entity) throw new MaterializedWorldError(`Attribute references missing entity ${commitment.entityId}.`);
      entity.attributes[commitment.attribute] = commitment.value;
      return;
    }
    if (!this.entities.has(commitment.subjectId)) throw new MaterializedWorldError(`Relation references missing subject ${commitment.subjectId}.`);
    this.relations.set(`${commitment.subjectId}\u0000${commitment.predicate}`, { ...commitment, setAtSequence: commitSequence });
  }
}
