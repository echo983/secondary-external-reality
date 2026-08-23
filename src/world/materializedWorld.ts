import type { CommitPackage, WorldCommitment } from "../protocol/types.js";

export interface MaterializedEntity {
  entityId: string;
  entityType: string;
  attributes: Record<string, string>;
  attributeRevisions: Record<string, number>;
  createdAtSequence: number;
}

export interface MaterializedRelation {
  relationId: string;
  subjectId: string;
  predicate: string;
  objectId: string;
  setAtSequence: number;
}

export class MaterializedWorldError extends Error {}

export class MaterializedWorld {
  readonly entities = new Map<string, MaterializedEntity>();
  readonly relations = new Map<string, MaterializedRelation>();

  static replay(commits: readonly CommitPackage[], seedCommitments: readonly WorldCommitment[] = []): MaterializedWorld {
    const world = new MaterializedWorld();
    for (const commitment of seedCommitments) world.apply(commitment, -1);
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

  directLocation(entityId: string): MaterializedRelation | null {
    return [...this.relations.values()].find((relation) =>
      relation.subjectId === entityId && ["located_on", "contained_by", "held_by"].includes(relation.predicate),
    ) ?? null;
  }

  private apply(commitment: WorldCommitment, commitSequence: number): void {
    if (commitment.kind === "entity_created") {
      if (this.entities.has(commitment.entityId)) throw new MaterializedWorldError(`Entity ${commitment.entityId} was created twice.`);
      this.entities.set(commitment.entityId, { entityId: commitment.entityId, entityType: commitment.entityType, attributes: {}, attributeRevisions: {}, createdAtSequence: commitSequence });
      return;
    }
    if (commitment.kind === "attribute_set") {
      const entity = this.entities.get(commitment.entityId);
      if (!entity) throw new MaterializedWorldError(`Attribute references missing entity ${commitment.entityId}.`);
      entity.attributes[commitment.attribute] = commitment.value;
      entity.attributeRevisions[commitment.attribute] = commitSequence;
      return;
    }
    if (commitment.kind === "relation_ended") {
      if (!this.relations.delete(commitment.relationId)) throw new MaterializedWorldError(`Cannot end inactive relation ${commitment.relationId}.`);
      return;
    }
    if (!this.entities.has(commitment.subjectId)) throw new MaterializedWorldError(`Relation references missing subject ${commitment.subjectId}.`);
    const relationId = commitment.kind === "relation_asserted"
      ? commitment.relationId
      : `legacy:${commitment.subjectId}:${commitment.predicate}`;
    if (commitment.kind === "relation_asserted" && this.relations.has(relationId)) {
      throw new MaterializedWorldError(`Relation ${relationId} was asserted twice without ending.`);
    }
    if (["located_on", "contained_by", "held_by"].includes(commitment.predicate)) {
      const existingLocation = [...this.relations.values()].find((relation) =>
        relation.subjectId === commitment.subjectId && ["located_on", "contained_by", "held_by"].includes(relation.predicate),
      );
      if (existingLocation && existingLocation.relationId !== relationId) {
        throw new MaterializedWorldError(`Entity ${commitment.subjectId} already has an active direct location.`);
      }
    }
    if (commitment.predicate === "contained_by") {
      let cursor = commitment.objectId;
      const visited = new Set([commitment.subjectId]);
      while (true) {
        if (visited.has(cursor)) throw new MaterializedWorldError("Containment relation would form a cycle.");
        visited.add(cursor);
        const parent = [...this.relations.values()].find((relation) => relation.subjectId === cursor && relation.predicate === "contained_by");
        if (!parent) break;
        cursor = parent.objectId;
      }
    }
    this.relations.set(relationId, { relationId, subjectId: commitment.subjectId, predicate: commitment.predicate, objectId: commitment.objectId, setAtSequence: commitSequence });
  }
}
