// Minimal parser for the v0.1 content-pack format
// (content-pipeline/pack-format/SPEC-v0.1.md on branch content-pipeline/sdlpal-import).
//
// This is a deliberate, temporary duplication of
// content-pipeline/pack-format/src/parser.ts, not an import from it: that
// code lives only on the separate, unmerged content-pipeline/sdlpal-import
// branch, and src/ cannot depend on a file that doesn't exist in this
// branch's history. Whether the kernel and the content pipeline should
// eventually share one package is a stage-2 decision
// (docs/STATUS-four-stage-maturity-assessment-v1.0.md §6), not one this
// probe is authorized to make.
//
// Deliberately small and dependency-free — no bracket/indentation grammar to
// get subtly wrong, so this stays auditable in one read. Malformed records
// are isolated and reported, never allowed to abort parsing of the rest of
// the file — that local-recovery property is the entire point of the format.

export interface PackRecord {
  recordType: string;
  startLine: number;
  fields: Record<string, string[]>;
  narrative?: string;
}

export interface PackError {
  line: number;
  message: string;
}

export interface PackParseResult {
  records: PackRecord[];
  errors: PackError[];
}

export function field(record: PackRecord, key: string): string | undefined {
  return record.fields[key]?.[0];
}

export function fieldList(record: PackRecord, key: string): string[] {
  return record.fields[key] ?? [];
}

const RECORD_HEADER = /^===\s+(\S+)\s*$/u;
const FIELD_LINE = /^(\S+):\s?(.*)$/u;

interface InProgressRecord {
  recordType: string;
  startLine: number;
  fields: Record<string, string[]>;
  mode: "fields" | "narrative";
  narrativeLines: string[];
}

function finalizeRecord(inProgress: InProgressRecord, result: PackParseResult): void {
  const narrative = inProgress.mode === "narrative" ? inProgress.narrativeLines.join("\n").trim() : "";
  const record: PackRecord = {
    recordType: inProgress.recordType,
    startLine: inProgress.startLine,
    fields: inProgress.fields,
    ...(narrative ? { narrative } : {}),
  };
  const id = record.fields.id?.[0];
  if (!id) {
    result.errors.push({ line: inProgress.startLine, message: `record "${inProgress.recordType}" is missing required field "id"` });
    return;
  }
  if (record.recordType === "entity" && !record.fields.type?.[0]) {
    result.errors.push({ line: inProgress.startLine, message: `entity "${id}" is missing required field "type"` });
    return;
  }
  result.records.push(record);
}

export function parsePack(text: string): PackParseResult {
  const result: PackParseResult = { records: [], errors: [] };
  const lines = text.split(/\r\n|\n/u);
  let current: InProgressRecord | null = null;

  for (const [index, rawLine] of lines.entries()) {
    const lineNo = index + 1;
    const headerMatch = RECORD_HEADER.exec(rawLine);
    if (headerMatch) {
      if (current) finalizeRecord(current, result);
      current = { recordType: headerMatch[1]!, startLine: lineNo, fields: {}, mode: "fields", narrativeLines: [] };
      continue;
    }
    if (!current) {
      if (rawLine.trim().length > 0) result.errors.push({ line: lineNo, message: `content before any "=== <type>" record header: ${JSON.stringify(rawLine)}` });
      continue;
    }
    if (current.mode === "narrative") {
      current.narrativeLines.push(rawLine);
      continue;
    }
    if (rawLine.trim() === "---") {
      current.mode = "narrative";
      continue;
    }
    if (rawLine.trim().length === 0) continue;
    const fieldMatch = FIELD_LINE.exec(rawLine);
    if (!fieldMatch) {
      result.errors.push({ line: lineNo, message: `expected "key: value" or "---", got: ${JSON.stringify(rawLine)}` });
      continue;
    }
    const key = fieldMatch[1]!;
    const value = fieldMatch[2]!.trim();
    (current.fields[key] ??= []).push(value);
  }
  if (current) finalizeRecord(current, result);
  return result;
}
