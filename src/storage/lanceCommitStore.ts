import { createHash } from "node:crypto";

import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";

import type { CommitPackage, TurnAttempt } from "../protocol/types.js";

const COMMIT_TABLE = "world_commits";
const ATTEMPT_TABLE = "turn_attempts";

interface CommitRow extends Record<string, unknown> {
  commit_id: string;
  turn_id: string;
  commit_sequence: number;
  selected_candidate_id: string;
  expected_projection_revisions_json: string;
  resolved_projections_json: string;
  events_json: string;
  state_changes_json: string;
  observations_json: string;
  new_world_commitments_json: string;
  package_json: string;
  package_hash: string;
  created_at: string;
}

interface AttemptRow extends Record<string, unknown> {
  attempt_id: string;
  root_turn_id: string;
  step_index: number;
  step_count: number;
  status: string;
  record_json: string;
  record_hash: string;
  created_at: string;
}

export interface AppendCommitResult {
  status: "appended" | "existing";
  commitId: string;
  packageHash: string;
  tableVersion: number;
}

export class CommitConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitConflictError";
  }
}

function serializePackage(commitPackage: CommitPackage): string {
  return JSON.stringify(commitPackage);
}

function hashPackage(serialized: string): string {
  return createHash("sha256").update(serialized).digest("hex");
}

function rowFromPackage(commitPackage: CommitPackage): CommitRow {
  const packageJson = serializePackage(commitPackage);
  const packageHash = hashPackage(packageJson);
  return {
    commit_id: `${commitPackage.turnId}:${commitPackage.commitSequence}`,
    turn_id: commitPackage.turnId,
    commit_sequence: commitPackage.commitSequence,
    selected_candidate_id: commitPackage.selectedCandidateId,
    expected_projection_revisions_json: JSON.stringify(
      commitPackage.expectedProjectionRevisions,
    ),
    resolved_projections_json: JSON.stringify(commitPackage.resolvedProjections),
    events_json: JSON.stringify(commitPackage.events),
    state_changes_json: JSON.stringify(commitPackage.stateChanges),
    observations_json: JSON.stringify(commitPackage.observations),
    new_world_commitments_json: JSON.stringify(
      commitPackage.newWorldCommitments,
    ),
    package_json: packageJson,
    package_hash: packageHash,
    created_at: new Date().toISOString(),
  };
}

function normalizeRows(rows: unknown[]): CommitRow[] {
  return rows as CommitRow[];
}

export class LanceCommitStore {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private attemptTable: Table | null = null;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly uri: string) {}

  async open(): Promise<void> {
    if (this.connection) return;
    this.connection = await lancedb.connect(this.uri);
    if ((await this.connection.tableNames()).includes(COMMIT_TABLE)) {
      this.table = await this.connection.openTable(COMMIT_TABLE);
    }
    if ((await this.connection.tableNames()).includes(ATTEMPT_TABLE)) {
      this.attemptTable = await this.connection.openTable(ATTEMPT_TABLE);
    }
  }

  close(): void {
    this.table?.close();
    this.attemptTable?.close();
    this.connection?.close();
    this.table = null;
    this.attemptTable = null;
    this.connection = null;
  }

  async append(commitPackage: CommitPackage): Promise<AppendCommitResult> {
    const operation = this.writeTail.then(
      () => this.appendSerialized(commitPackage),
      () => this.appendSerialized(commitPackage),
    );
    this.writeTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async list(): Promise<CommitPackage[]> {
    await this.open();
    if (!this.table) return [];
    const rows = normalizeRows(await this.table.query().toArray());
    return rows
      .sort((left, right) => Number(left.commit_sequence) - Number(right.commit_sequence))
      .map((row) => JSON.parse(row.package_json) as CommitPackage);
  }

  async appendTurnAttempt(attempt: TurnAttempt): Promise<void> {
    const operation = this.writeTail.then(
      () => this.appendAttemptSerialized(attempt),
      () => this.appendAttemptSerialized(attempt),
    );
    this.writeTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async listTurnAttempts(rootTurnId?: string): Promise<TurnAttempt[]> {
    await this.open();
    if (!this.attemptTable) return [];
    const rows = await this.attemptTable.query().toArray() as AttemptRow[];
    return rows
      .map((row) => JSON.parse(row.record_json) as TurnAttempt)
      .filter((attempt) => rootTurnId === undefined || attempt.rootTurnId === rootTurnId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.stepIndex - right.stepIndex);
  }

  private async appendAttemptSerialized(attempt: TurnAttempt): Promise<void> {
    await this.open();
    if (!this.connection) throw new Error("LanceDB connection is not open.");
    const recordJson = JSON.stringify(attempt);
    const row: AttemptRow = {
      attempt_id: attempt.attemptId,
      root_turn_id: attempt.rootTurnId,
      step_index: attempt.stepIndex,
      step_count: attempt.stepCount,
      status: attempt.status,
      record_json: recordJson,
      record_hash: hashPackage(recordJson),
      created_at: attempt.createdAt,
    };
    const rows = this.attemptTable ? await this.attemptTable.query().toArray() as AttemptRow[] : [];
    const existing = rows.find((candidate) => candidate.attempt_id === row.attempt_id);
    if (existing) {
      if (existing.record_hash !== row.record_hash) throw new CommitConflictError(`Turn attempt ${row.attempt_id} already exists with different content.`);
      return;
    }
    if (!this.attemptTable) this.attemptTable = await this.connection.createTable(ATTEMPT_TABLE, [row]);
    else await this.attemptTable.add([row]);
  }

  private async appendSerialized(
    commitPackage: CommitPackage,
  ): Promise<AppendCommitResult> {
    await this.open();
    const row = rowFromPackage(commitPackage);
    const existingRows = this.table
      ? normalizeRows(await this.table.query().toArray())
      : [];
    const sameIdentity = existingRows.find(
      (existing) =>
        existing.turn_id === row.turn_id &&
        Number(existing.commit_sequence) === row.commit_sequence,
    );

    if (sameIdentity) {
      if (sameIdentity.package_hash !== row.package_hash) {
        throw new CommitConflictError(
          `Commit identity ${row.commit_id} already exists with different content.`,
        );
      }
      return {
        status: "existing",
        commitId: row.commit_id,
        packageHash: row.package_hash,
        tableVersion: await this.table!.version(),
      };
    }

    const lastSequence = existingRows.reduce(
      (maximum, existing) => Math.max(maximum, Number(existing.commit_sequence)),
      -1,
    );
    if (row.commit_sequence !== lastSequence + 1) {
      throw new CommitConflictError(
        `Expected commit sequence ${lastSequence + 1}, received ${row.commit_sequence}.`,
      );
    }

    if (!this.connection) {
      throw new Error("LanceDB connection is not open.");
    }
    if (!this.table) {
      this.table = await this.connection.createTable(COMMIT_TABLE, [row]);
    } else {
      await this.table.add([row]);
    }

    const writtenRows = normalizeRows(await this.table.query().toArray());
    const confirmed = writtenRows.some(
      (written) =>
        written.turn_id === row.turn_id &&
        Number(written.commit_sequence) === row.commit_sequence &&
        written.package_hash === row.package_hash,
    );
    if (!confirmed) {
      throw new Error(`LanceDB did not confirm commit ${row.commit_id}.`);
    }

    return {
      status: "appended",
      commitId: row.commit_id,
      packageHash: row.package_hash,
      tableVersion: await this.table.version(),
    };
  }
}
