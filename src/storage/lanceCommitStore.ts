import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";

import type { CommitPackage, TurnAttempt } from "../protocol/types.js";
import type { WorldCommitment } from "../protocol/types.js";
import { replayCanonicalViews, type CanonicalReplayMode, type CanonicalReplayViews } from "../replay/canonicalReplay.js";
import { validateCanonicalEnvelope } from "../protocol/canonicalValidator.js";
import { MaterializedWorld, MaterializedWorldError } from "../world/materializedWorld.js";

const COMMIT_TABLE = "world_commits";
const ATTEMPT_TABLE = "turn_attempts";
const ACTION_PROPOSAL_TABLE = "action_proposals";

export interface ActionProposalAudit {
  auditId: string;
  rootTurnId: string;
  mode: "shadow" | "active";
  inputHash: string;
  outputHash?: string;
  status: "validated" | "rejected" | "model_error";
  failureStage?: "proposal" | "validation" | "audit" | "grounding" | "compile" | "execution";
  proposal?: unknown;
  validationIssues: unknown[];
  groundingIssues: unknown[];
  semanticIssues?: unknown[];
  model?: string;
  latencyMs?: number;
  usage?: Record<string, unknown>;
  createdAt: string;
}

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

interface ActionProposalRow extends Record<string, unknown> {
  audit_id: string;
  root_turn_id: string;
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

export interface CommitAdmissionOptions {
  seedCommitments?: readonly WorldCommitment[];
}

export interface RepairTurnAttemptsResult {
  repaired: number;
  existing: number;
  skipped: number;
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
  private actionProposalTable: Table | null = null;
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
    if ((await this.connection.tableNames()).includes(ACTION_PROPOSAL_TABLE)) {
      this.actionProposalTable = await this.connection.openTable(ACTION_PROPOSAL_TABLE);
    }
  }

  close(): void {
    this.table?.close();
    this.attemptTable?.close();
    this.actionProposalTable?.close();
    this.connection?.close();
    this.table = null;
    this.attemptTable = null;
    this.actionProposalTable = null;
    this.connection = null;
  }

  async append(commitPackage: CommitPackage, admission: CommitAdmissionOptions = {}): Promise<AppendCommitResult> {
    const operation = this.writeTail.then(
      () => this.withWorldWriteLock(() => this.appendSerialized(commitPackage, admission)),
      () => this.withWorldWriteLock(() => this.appendSerialized(commitPackage, admission)),
    );
    this.writeTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async withWorldWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.uri}.commit.lock`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await mkdir(lockPath);
        try {
          await writeFile(`${lockPath}/owner.json`, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
          return await operation();
        } finally {
          await rm(lockPath, { recursive: true, force: true });
        }
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
        let stale = false;
        try {
          const owner = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as { pid?: unknown };
          if (!Number.isSafeInteger(owner.pid)) stale = (Date.now() - (await stat(lockPath)).mtimeMs) > 30_000;
          else {
            try { process.kill(owner.pid as number, 0); }
            catch (signalError) { stale = signalError instanceof Error && "code" in signalError && signalError.code === "ESRCH"; }
          }
        } catch {
          try { stale = (Date.now() - (await stat(lockPath)).mtimeMs) > 30_000; }
          catch (statError) {
            if (statError instanceof Error && "code" in statError && statError.code === "ENOENT") continue;
            throw statError;
          }
        }
        if (stale) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    throw new CommitConflictError("Timed out waiting for the world commit writer lock.");
  }

  async list(): Promise<CommitPackage[]> {
    await this.open();
    if (!this.table) return [];
    const rows = normalizeRows(await this.table.query().toArray());
    return rows
      .sort((left, right) => Number(left.commit_sequence) - Number(right.commit_sequence))
      .map((row) => JSON.parse(row.package_json) as CommitPackage);
  }

  async replayCanonicalViews(
    seedCommitments: readonly WorldCommitment[],
    mode: CanonicalReplayMode = "strict",
  ): Promise<CanonicalReplayViews> {
    return replayCanonicalViews(await this.list(), { seedCommitments, mode });
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

  async appendActionProposalAudit(audit: ActionProposalAudit): Promise<void> {
    const operation = this.writeTail.then(
      () => this.appendActionProposalAuditSerialized(audit),
      () => this.appendActionProposalAuditSerialized(audit),
    );
    this.writeTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async listActionProposalAudits(rootTurnId?: string): Promise<ActionProposalAudit[]> {
    await this.open();
    if (!this.actionProposalTable) return [];
    const rows = await this.actionProposalTable.query().toArray() as ActionProposalRow[];
    return rows.map((row) => JSON.parse(row.record_json) as ActionProposalAudit)
      .filter((audit) => rootTurnId === undefined || audit.rootTurnId === rootTurnId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async appendActionProposalAuditSerialized(audit: ActionProposalAudit): Promise<void> {
    await this.open();
    if (!this.connection) throw new Error("LanceDB connection is not open.");
    const recordJson = JSON.stringify(audit);
    const row: ActionProposalRow = {
      audit_id: audit.auditId, root_turn_id: audit.rootTurnId, status: audit.status,
      record_json: recordJson, record_hash: hashPackage(recordJson), created_at: audit.createdAt,
    };
    const rows = this.actionProposalTable ? await this.actionProposalTable.query().toArray() as ActionProposalRow[] : [];
    const existing = rows.find((candidate) => candidate.audit_id === row.audit_id);
    if (existing) {
      if (existing.record_hash !== row.record_hash) throw new CommitConflictError(`Action proposal audit ${row.audit_id} already exists with different content.`);
      return;
    }
    if (!this.actionProposalTable) this.actionProposalTable = await this.connection.createTable(ACTION_PROPOSAL_TABLE, [row]);
    else await this.actionProposalTable.add([row]);
  }

  async repairTurnAttempts(): Promise<RepairTurnAttemptsResult> {
    const operation = this.writeTail.then(
      () => this.repairTurnAttemptsSerialized(),
      () => this.repairTurnAttemptsSerialized(),
    );
    this.writeTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async repairTurnAttemptsSerialized(): Promise<RepairTurnAttemptsResult> {
    await this.open();
    const result: RepairTurnAttemptsResult = { repaired: 0, existing: 0, skipped: 0 };
    if (!this.table) return result;
    const commitRows = normalizeRows(await this.table.query().toArray())
      .sort((left, right) => Number(left.commit_sequence) - Number(right.commit_sequence));
    for (const row of commitRows) {
      const commitPackage = JSON.parse(row.package_json) as CommitPackage;
      if (commitPackage.rootTurnId === undefined || commitPackage.stepIndex === undefined ||
          commitPackage.stepCount === undefined || commitPackage.attemptedTtd === undefined) {
        result.skipped += 1;
        continue;
      }
      const attemptId = `${commitPackage.rootTurnId}:${commitPackage.stepIndex}`;
      const recovered: TurnAttempt = {
        attemptId,
        rootTurnId: commitPackage.rootTurnId,
        stepIndex: commitPackage.stepIndex,
        stepCount: commitPackage.stepCount,
        rawTtd: commitPackage.attemptedTtd,
        status: "committed",
        commitSequence: commitPackage.commitSequence,
        selectedCandidateId: commitPackage.selectedCandidateId,
        createdAt: String(row.created_at),
      };
      const existingRow = this.attemptTable
        ? (await this.attemptTable.query().toArray() as AttemptRow[]).find((attempt) => attempt.attempt_id === attemptId)
        : undefined;
      if (existingRow) {
        const existing = JSON.parse(existingRow.record_json) as TurnAttempt;
        const matchesCommit = existing.status === "committed" &&
          existing.rootTurnId === recovered.rootTurnId && existing.stepIndex === recovered.stepIndex &&
          existing.stepCount === recovered.stepCount && existing.rawTtd === recovered.rawTtd &&
          existing.commitSequence === recovered.commitSequence &&
          existing.selectedCandidateId === recovered.selectedCandidateId;
        if (!matchesCommit) throw new CommitConflictError(`Turn attempt ${attemptId} conflicts with its world commit.`);
        result.existing += 1;
        continue;
      }
      await this.appendAttemptSerialized(recovered);
      result.repaired += 1;
    }
    return result;
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
    admission: CommitAdmissionOptions,
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
    if (commitPackage.expectedWorldCommitSequence !== undefined && commitPackage.expectedWorldCommitSequence !== lastSequence) {
      throw new CommitConflictError(`World changed after candidate preparation: expected ${commitPackage.expectedWorldCommitSequence}, found ${lastSequence}.`);
    }

    const priorPackages = existingRows.map((existing) => JSON.parse(existing.package_json) as CommitPackage);
    this.validateWorldBasis(priorPackages, commitPackage, admission.seedCommitments ?? []);
    const currentWorld = MaterializedWorld.replay(priorPackages, admission.seedCommitments ?? []);
    this.validateStateBridge(commitPackage, currentWorld);
    this.validateGlobalIdentities(priorPackages, commitPackage);
    try {
      const futureWorld = MaterializedWorld.replay([...priorPackages, commitPackage], admission.seedCommitments ?? []);
      this.validatePackageReferences(priorPackages, commitPackage, futureWorld);
      if (commitPackage.canonical) {
        const canonicalIssues = validateCanonicalEnvelope(commitPackage.canonical, {
          commitSequence: commitPackage.commitSequence,
          eventIds: new Set(commitPackage.events.map((event) => event.eventId)),
          knownAgentIds: new Set([...futureWorld.entities.values()].filter((entity) => entity.entityType === "person").map((entity) => entity.entityId)),
          legacyEvidence: commitPackage.evidenceGenerated ?? [],
          legacyEpistemicChanges: commitPackage.epistemicChanges ?? [],
        });
        if (canonicalIssues.length > 0) throw new CommitConflictError(`Canonical envelope rejected: ${canonicalIssues.map((entry) => `${entry.code} at ${entry.path}`).join("; ")}`);
      }
    } catch (error) {
      if (error instanceof MaterializedWorldError || error instanceof Error) {
        throw new CommitConflictError(`World preflight rejected commit: ${error.message}`);
      }
      throw error;
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

  private validateStateBridge(commitPackage: CommitPackage, currentWorld: MaterializedWorld): void {
    for (const change of commitPackage.stateChanges) {
      const match = /^entity:([^.]+)\.(.+)$/u.exec(change.projection);
      if (!match) throw new CommitConflictError(`State change ${change.projection} lacks an entity attribute address.`);
      const [, entityId, attribute] = match;
      const bridged = commitPackage.newWorldCommitments.some((commitment) =>
        commitment.kind === "attribute_set" && commitment.entityId === entityId &&
        commitment.attribute === attribute && commitment.value === change.to,
      );
      if (!bridged) throw new CommitConflictError(`State change ${change.projection} lacks a matching attribute commitment.`);
      const currentValue = currentWorld.entities.get(entityId!)?.attributes[attribute!];
      if (change.from !== undefined && currentValue !== change.from) {
        throw new CommitConflictError(`State change ${change.projection} expected ${change.from}, found ${currentValue ?? "missing"}.`);
      }
    }
  }

  private validateGlobalIdentities(prior: readonly CommitPackage[], next: CommitPackage): void {
    const eventIds = new Set(prior.flatMap((commit) => commit.events.map((event) => event.eventId)));
    const evidenceIds = new Set(prior.flatMap((commit) => (commit.evidenceGenerated ?? []).map((evidence) => evidence.evidenceId)));
    const resolved = new Map(prior.flatMap((commit) => commit.resolvedProjections.map((snapshot) => [snapshot.projection, snapshot.value] as const)));
    for (const event of next.events) {
      if (eventIds.has(event.eventId)) throw new CommitConflictError(`Event ID ${event.eventId} already exists.`);
      eventIds.add(event.eventId);
    }
    for (const evidence of next.evidenceGenerated ?? []) {
      if (evidenceIds.has(evidence.evidenceId)) throw new CommitConflictError(`Evidence ID ${evidence.evidenceId} already exists.`);
      evidenceIds.add(evidence.evidenceId);
    }
    for (const snapshot of next.resolvedProjections) {
      const fixed = resolved.get(snapshot.projection);
      if (fixed !== undefined && fixed !== snapshot.value) throw new CommitConflictError(`Projection ${snapshot.projection} was already fixed to ${fixed}.`);
    }
  }

  private validateWorldBasis(prior: readonly CommitPackage[], next: CommitPackage, seedCommitments: readonly WorldCommitment[]): void {
    if (!next.worldBasis) return;
    const admittedSeedHash = createHash("sha256").update(JSON.stringify(seedCommitments)).digest("hex");
    if (admittedSeedHash !== next.worldBasis.seedHash) {
      throw new CommitConflictError("Commit world basis does not match the admitted seed commitments.");
    }
    for (const commit of prior) {
      if (!commit.worldBasis) continue;
      if (commit.worldBasis.fixtureId !== next.worldBasis.fixtureId ||
          commit.worldBasis.fixtureVersion !== next.worldBasis.fixtureVersion ||
          commit.worldBasis.seedHash !== next.worldBasis.seedHash) {
        throw new CommitConflictError("Commit world basis conflicts with the existing world history.");
      }
    }
  }

  private validatePackageReferences(prior: readonly CommitPackage[], next: CommitPackage, futureWorld: MaterializedWorld): void {
    const priorEventIds = new Set(prior.flatMap((commit) => commit.events.map((event) => event.eventId)));
    const nextEventIds = new Set(next.events.map((event) => event.eventId));
    const allEvidenceIds = new Set([
      ...prior.flatMap((commit) => (commit.evidenceGenerated ?? []).map((evidence) => evidence.evidenceId)),
      ...(next.evidenceGenerated ?? []).map((evidence) => evidence.evidenceId),
    ]);
    for (const event of next.events) {
      for (const entityId of [event.subjectRef, event.objectRef]) {
        if (entityId !== undefined && !futureWorld.entities.has(entityId)) {
          throw new CommitConflictError(`Event ${event.eventId} references missing entity ${entityId}.`);
        }
      }
    }
    for (const change of next.stateChanges) {
      if (!nextEventIds.has(change.causedByEventId)) throw new CommitConflictError(`State change references missing event ${change.causedByEventId}.`);
    }
    for (const evidence of next.evidenceGenerated ?? []) {
      if (!nextEventIds.has(evidence.sourceEventId) && !priorEventIds.has(evidence.sourceEventId)) {
        throw new CommitConflictError(`Evidence ${evidence.evidenceId} references missing event ${evidence.sourceEventId}.`);
      }
      for (const entityId of [evidence.subjectId, evidence.objectId]) {
        if (entityId !== undefined && !futureWorld.entities.has(entityId)) {
          throw new CommitConflictError(`Evidence ${evidence.evidenceId} references missing entity ${entityId}.`);
        }
      }
    }
    for (const change of next.epistemicChanges ?? []) {
      if (!futureWorld.entities.has(change.agentId)) throw new CommitConflictError(`Epistemic change references missing agent ${change.agentId}.`);
      if (!allEvidenceIds.has(change.evidenceId)) throw new CommitConflictError(`Epistemic change references missing evidence ${change.evidenceId}.`);
    }
  }
}
