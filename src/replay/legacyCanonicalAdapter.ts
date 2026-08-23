import { Buffer } from "node:buffer";

import type { CommitPackage, WorldCommitment } from "../protocol/types.js";
import type { CanonicalEvidenceRecord, EpistemicAcquisition, ObservationRecord, ReplayIssue } from "../epistemic/types.js";
import type { LegacyFixedProjection } from "../world/commitmentTypes.js";
import { entityAttributeAddress, relationSlotAddress, tryUpgradeLegacyAddress } from "../world/semanticAddress.js";

export interface LegacyAdapterOptions {
  seedCommitments: readonly WorldCommitment[];
}

export interface CanonicalReplayInput {
  legacyFixedProjections: LegacyFixedProjection[];
  observations: ObservationRecord[];
  evidence: CanonicalEvidenceRecord[];
  acquisitions: EpistemicAcquisition[];
  issues: ReplayIssue[];
}

function encodedId(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function issue(issues: ReplayIssue[], code: ReplayIssue["code"], path: string, message: string, fatal = true): void {
  issues.push({ code, path, message, fatal });
}

function entitiesFrom(commitments: readonly WorldCommitment[], target: Set<string>): void {
  for (const commitment of commitments) {
    if (commitment.kind === "entity_created") target.add(commitment.entityId);
  }
}

export function adaptLegacyCommits(
  input: readonly CommitPackage[],
  options: LegacyAdapterOptions,
): CanonicalReplayInput {
  const commits = [...input].sort((left, right) => left.commitSequence - right.commitSequence);
  const issues: ReplayIssue[] = [];
  const legacyFixedProjections: LegacyFixedProjection[] = [];
  const observations: ObservationRecord[] = [];
  const evidence: CanonicalEvidenceRecord[] = [];
  const acquisitions: EpistemicAcquisition[] = [];
  const entityIds = new Set<string>();
  entitiesFrom(options.seedCommitments, entityIds);
  for (const commit of commits) entitiesFrom(commit.newWorldCommitments, entityIds);

  const eventIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const adaptedEvidenceIds = new Set<string>();
  const acquisitionIds = new Set<string>();
  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]!;
    if (commit.commitSequence !== index) {
      issue(issues, "NON_CONTIGUOUS_COMMIT_SEQUENCE", `commits[${index}].commitSequence`, `Expected ${index}, found ${commit.commitSequence}.`);
    }
    for (const [eventIndex, event] of commit.events.entries()) {
      if (eventIds.has(event.eventId)) issue(issues, "DUPLICATE_EVENT_ID", `commits[${index}].events[${eventIndex}].eventId`, `Event ${event.eventId} is duplicated.`);
      eventIds.add(event.eventId);
    }
  }

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]!;
    for (const [projectionIndex, snapshot] of commit.resolvedProjections.entries()) {
      const upgrade = tryUpgradeLegacyAddress(snapshot.projection);
      if (upgrade.classification === "unclassified") {
        issue(issues, "LEGACY_ADDRESS_UNCLASSIFIED", `commits[${index}].resolvedProjections[${projectionIndex}].projection`, `Legacy projection ${snapshot.projection} cannot be safely classified.`);
      }
      legacyFixedProjections.push({
        sourceAddress: snapshot.projection,
        ...(upgrade.canonicalAddress ? { canonicalAddress: upgrade.canonicalAddress } : {}),
        value: snapshot.value,
        fixedAtCommitSequence: commit.commitSequence,
        classification: upgrade.classification,
        provenance: "legacy_fixed",
      });
    }

    const changes = commit.epistemicChanges ?? [];
    const agentByEvidence = new Map<string, string>();
    for (const change of changes) {
      if (!agentByEvidence.has(change.evidenceId)) agentByEvidence.set(change.evidenceId, change.agentId);
    }

    for (const [evidenceIndex, legacy] of (commit.evidenceGenerated ?? []).entries()) {
      const path = `commits[${index}].evidenceGenerated[${evidenceIndex}]`;
      if (evidenceIds.has(legacy.evidenceId)) {
        issue(issues, "DUPLICATE_EVIDENCE_ID", `${path}.evidenceId`, `Evidence ${legacy.evidenceId} is duplicated.`);
        continue;
      }
      evidenceIds.add(legacy.evidenceId);
      if (!eventIds.has(legacy.sourceEventId)) {
        issue(issues, "MISSING_EVIDENCE_EVENT", `${path}.sourceEventId`, `Evidence ${legacy.evidenceId} references missing event ${legacy.sourceEventId}.`);
        continue;
      }
      const sourceEvent = commits.flatMap((candidate) => candidate.events).find((event) => event.eventId === legacy.sourceEventId);
      const observerId = sourceEvent?.subjectRef ?? agentByEvidence.get(legacy.evidenceId);
      if (!observerId) {
        issue(issues, "INVALID_LEGACY_RECORD_SHAPE", path, `Evidence ${legacy.evidenceId} has no observer source.`);
        continue;
      }
      const observationId = `legacy-observation:${commit.commitSequence}:${encodedId(legacy.evidenceId)}`;
      if (legacy.kind === "entity_observed") {
        observations.push({ observationId, kind: "entity_presence", observerId, entityIds: [legacy.subjectId], sourceOccurrenceId: legacy.sourceEventId, provenance: "legacy" });
        evidence.push({ evidenceId: legacy.evidenceId, representedValue: [legacy.subjectId], sourceObservationId: observationId, provenance: "legacy" });
        adaptedEvidenceIds.add(legacy.evidenceId);
      } else if (legacy.kind === "attribute_observed") {
        if (!legacy.attribute || legacy.value === undefined) {
          issue(issues, "INVALID_LEGACY_RECORD_SHAPE", path, `Attribute evidence ${legacy.evidenceId} is incomplete.`);
          continue;
        }
        const address = entityAttributeAddress(legacy.subjectId, legacy.attribute);
        observations.push({ observationId, kind: "attribute_perception", observerId, semanticAddress: address, perceivedValue: legacy.value, sourceOccurrenceId: legacy.sourceEventId, provenance: "legacy" });
        evidence.push({ evidenceId: legacy.evidenceId, propositionAddress: address, representedValue: legacy.value, sourceObservationId: observationId, provenance: "legacy" });
        adaptedEvidenceIds.add(legacy.evidenceId);
      } else if (legacy.kind === "relation_observed") {
        if (!legacy.predicate || !legacy.objectId) {
          issue(issues, "INVALID_LEGACY_RECORD_SHAPE", path, `Relation evidence ${legacy.evidenceId} is incomplete.`);
          continue;
        }
        const address = relationSlotAddress(legacy.subjectId, legacy.predicate);
        observations.push({ observationId, kind: "relation_perception", observerId, semanticAddress: address, perceivedValue: legacy.objectId, sourceOccurrenceId: legacy.sourceEventId, provenance: "legacy" });
        evidence.push({ evidenceId: legacy.evidenceId, propositionAddress: address, representedValue: legacy.objectId, sourceObservationId: observationId, provenance: "legacy" });
        adaptedEvidenceIds.add(legacy.evidenceId);
      } else {
        issue(issues, "UNSUPPORTED_LEGACY_EVIDENCE_KIND", `${path}.kind`, `Evidence ${legacy.evidenceId} has an unsupported kind.`);
      }
    }

    for (const [changeIndex, change] of changes.entries()) {
      const path = `commits[${index}].epistemicChanges[${changeIndex}]`;
      const acquisitionId = `legacy-acquisition:${commit.commitSequence}:${changeIndex}:${encodedId(change.agentId)}`;
      if (acquisitionIds.has(acquisitionId)) {
        issue(issues, "DUPLICATE_ACQUISITION_ID", `${path}.acquisitionId`, `Acquisition ${acquisitionId} is duplicated.`);
        continue;
      }
      acquisitionIds.add(acquisitionId);
      if (!adaptedEvidenceIds.has(change.evidenceId)) {
        issue(issues, "MISSING_ACQUISITION_EVIDENCE", `${path}.evidenceId`, `Acquisition references missing evidence ${change.evidenceId}.`);
        continue;
      }
      if (!entityIds.has(change.agentId)) {
        issue(issues, "MISSING_EPISTEMIC_AGENT", `${path}.agentId`, `Acquisition references missing agent ${change.agentId}.`);
        continue;
      }
      acquisitions.push({ acquisitionId, agentId: change.agentId, evidenceId: change.evidenceId, mode: "direct_perception", acquiredAtCommitSequence: commit.commitSequence, provenance: "legacy" });
    }
  }

  return {
    legacyFixedProjections: structuredClone(legacyFixedProjections),
    observations: structuredClone(observations),
    evidence: structuredClone(evidence),
    acquisitions: structuredClone(acquisitions),
    issues: structuredClone(issues),
  };
}
