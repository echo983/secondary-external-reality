export class DiscourseContext {
  private readonly exposed = new Set<string>();
  private focus: string[] = [];

  consumeFocus(): string[] {
    const result = [...this.focus];
    this.focus = [];
    return result;
  }

  expose(entityIds: readonly string[]): void {
    entityIds.forEach((entityId) => this.exposed.add(entityId));
  }

  setFocus(entityIds: readonly string[]): void {
    this.focus = [...new Set(entityIds)].filter((entityId) => this.exposed.has(entityId));
  }

  exposedCandidates(entityIds: readonly string[]): string[] {
    return [...new Set(entityIds)].filter((entityId) => this.exposed.has(entityId)).sort();
  }
}
