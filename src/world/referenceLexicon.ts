import type { ObjectWorldFixture } from "./objectFixture.js";
import { MaterializedWorld } from "./materializedWorld.js";

function stripLeadingEnglishArticle(normalized: string): string {
  return normalized.replace(/^(the|an?)\s+/, "");
}

const LOCATIVE_SUFFIXES = [
  { values: ["里面", "里头", "里", "中"], relation: "inside" as const },
  { values: ["上面", "上"], relation: "on" as const },
];

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
    const normalized = stripLeadingEnglishArticle(mention.trim().toLocaleLowerCase());
    const exact = this.resolveExactMention(normalized);
    if (exact.length > 0) return exact;
    // A lone Latin letter (e.g. the pronoun "I") is a legitimate EXACT alias
    // but must never feed substring matching here: almost any English
    // sentence contains that letter somewhere, so it would silently add the
    // entity to unrelated mentions (e.g. "self" matching inside "did").
    return [...this.aliases.entries()].filter(([, names]) => names.some((name) =>
      !/^[a-z]$/iu.test(name) && normalized.includes(name.toLocaleLowerCase())))
      .map(([entityId]) => entityId).sort();
  }

  // English source spans keep their determiner ("the note", "a pen"), unlike the
  // Chinese mentions this lexicon was originally matched against; strip it before
  // exact comparison so bilingual mentions of the same fixture alias are symmetric.
  resolveExactMention(mention: string): string[] {
    const normalized = stripLeadingEnglishArticle(mention.trim().toLocaleLowerCase());
    return [...this.aliases.entries()].filter(([, names]) => names.some((name) => normalized === name.toLocaleLowerCase()))
      .map(([entityId]) => entityId).sort();
  }

  resolveSpatialMention(mention: string): { entityIds: string[]; relation?: "inside" | "on" } {
    const exact = this.resolveExactMention(mention);
    if (exact.length > 0) return { entityIds: exact };
    const normalized = mention.trim().toLocaleLowerCase();
    for (const suffix of LOCATIVE_SUFFIXES) {
      const entityIds = [...this.aliases.entries()].filter(([, names]) => names.some((name) =>
        suffix.values.some((value) => normalized === `${name.toLocaleLowerCase()}${value}`),
      )).map(([entityId]) => entityId).sort();
      if (entityIds.length > 0) return { entityIds, relation: suffix.relation };
    }
    return { entityIds: [] };
  }

  // Non-destination (target/instrument) role mentions only ever get an exact
  // match, never resolveMention's broad fuzzy substring fallback (that risks
  // over-matching on unrelated aliases). But a source span like "抽屉里" for a
  // plain "what's in the drawer" query is a legitimate mention of drawer-1
  // that happens to carry a trailing locative particle — the same particle
  // resolveSpatialMention already strips for destination roles. Retry once
  // with it stripped before giving up, without changing resolveSpatialMention
  // itself (its relation-detection behavior must stay exactly as-is).
  resolveGroundedMention(mention: string): string[] {
    const exact = this.resolveExactMention(mention);
    if (exact.length > 0) return exact;
    const normalized = stripLeadingEnglishArticle(mention.trim().toLocaleLowerCase());
    for (const suffix of LOCATIVE_SUFFIXES) {
      for (const value of suffix.values) {
        if (normalized.length > value.length && normalized.endsWith(value)) {
          const delocated = this.resolveExactMention(normalized.slice(0, -value.length));
          if (delocated.length > 0) return delocated;
        }
      }
    }
    return [];
  }

  label(entityId: string, language: "zh" | "en"): string {
    return this.labels.get(entityId)?.[language] ?? entityId;
  }

  names(entityId: string): readonly string[] { return [...(this.aliases.get(entityId) ?? [])]; }
}
