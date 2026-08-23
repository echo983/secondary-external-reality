import type { ObjectWorldFixture } from "./objectFixture.js";
import { MaterializedWorld } from "./materializedWorld.js";

export class ReferenceLexicon {
  private readonly aliases = new Map<string, readonly string[]>();
  private readonly labels = new Map<string, { zh: string; en: string }>();

  constructor(fixture: ObjectWorldFixture) {
    const world = MaterializedWorld.replay([], fixture.seedCommitments);
    for (const entry of fixture.names) {
      this.aliases.set(entry.entityId, [...entry.names]);
      const entity = world.entities.get(entry.entityId);
      this.labels.set(entry.entityId, {
        zh: entity?.attributes.zh_name ?? entry.names.find((name) => /[\u3400-\u9fff]/u.test(name)) ?? entity?.entityType ?? entry.entityId,
        en: entity?.attributes.en_name ?? entry.names.find((name) => /^[\x00-\x7f]+$/u.test(name)) ?? entity?.entityType ?? entry.entityId,
      });
    }
  }

  resolveMention(mention: string): string[] {
    const normalized = mention.trim().toLocaleLowerCase();
    const exact = [...this.aliases.entries()].filter(([, names]) => names.some((name) => normalized === name.toLocaleLowerCase()))
      .map(([entityId]) => entityId).sort();
    if (exact.length > 0) return exact;
    return [...this.aliases.entries()].filter(([, names]) => names.some((name) => normalized.includes(name.toLocaleLowerCase())))
      .map(([entityId]) => entityId).sort();
  }

  label(entityId: string, language: "zh" | "en"): string {
    return this.labels.get(entityId)?.[language] ?? entityId;
  }

  names(entityId: string): readonly string[] { return [...(this.aliases.get(entityId) ?? [])]; }
}
