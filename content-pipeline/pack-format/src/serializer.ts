// Serializer counterpart to parser.ts — turns PackRecord objects back into
// v0.1 format text. Kept trivial on purpose: field order is insertion
// order, repeated keys just repeat the "key: value" line, narrative (if
// present) is emitted verbatim after a "---" line.

import type { PackRecord } from "./parser.ts";

export function serializeRecord(record: PackRecord): string {
  const lines: string[] = [`=== ${record.recordType}`];
  for (const [key, values] of Object.entries(record.fields)) {
    for (const value of values) lines.push(`${key}: ${value}`);
  }
  if (record.narrative) {
    lines.push("---");
    lines.push(record.narrative);
  }
  return lines.join("\n");
}

export function serializePack(records: readonly PackRecord[]): string {
  return `${records.map(serializeRecord).join("\n\n")}\n`;
}
