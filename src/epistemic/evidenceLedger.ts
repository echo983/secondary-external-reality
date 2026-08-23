import type { CanonicalEvidenceRecord, ObservationRecord, ReplayIssue } from "./types.js";

export interface EvidenceLedgerBuild {
  view: EvidenceLedgerView;
  issues: ReplayIssue[];
}

export class EvidenceLedgerView {
  private readonly observations: Map<string, ObservationRecord>;
  private readonly evidence: Map<string, CanonicalEvidenceRecord>;

  constructor(observations: readonly ObservationRecord[], evidence: readonly CanonicalEvidenceRecord[]) {
    this.observations = new Map(observations.map((record) => [record.observationId, structuredClone(record)]));
    this.evidence = new Map(evidence.map((record) => [record.evidenceId, structuredClone(record)]));
  }

  observation(observationId: string): ObservationRecord | undefined {
    const value = this.observations.get(observationId);
    return value ? structuredClone(value) : undefined;
  }

  evidenceById(evidenceId: string): CanonicalEvidenceRecord | undefined {
    const value = this.evidence.get(evidenceId);
    return value ? structuredClone(value) : undefined;
  }

  allObservations(): ObservationRecord[] {
    return structuredClone([...this.observations.values()]);
  }

  allEvidence(): CanonicalEvidenceRecord[] {
    return structuredClone([...this.evidence.values()]);
  }
}

export function buildEvidenceLedger(observations: readonly ObservationRecord[], evidence: readonly CanonicalEvidenceRecord[]): EvidenceLedgerBuild {
  const issues: ReplayIssue[] = [];
  const uniqueObservations = new Map<string, ObservationRecord>();
  const uniqueEvidence = new Map<string, CanonicalEvidenceRecord>();
  for (const [index, observation] of observations.entries()) {
    if (uniqueObservations.has(observation.observationId)) {
      issues.push({ code: "DUPLICATE_OBSERVATION_ID", path: `observations[${index}].observationId`, message: `Observation ${observation.observationId} is duplicated.`, fatal: true });
      continue;
    }
    uniqueObservations.set(observation.observationId, structuredClone(observation));
  }
  for (const [index, record] of evidence.entries()) {
    if (uniqueEvidence.has(record.evidenceId)) {
      issues.push({ code: "DUPLICATE_EVIDENCE_ID", path: `evidence[${index}].evidenceId`, message: `Evidence ${record.evidenceId} is duplicated.`, fatal: true });
      continue;
    }
    if (!uniqueObservations.has(record.sourceObservationId)) {
      issues.push({ code: "MISSING_EVIDENCE_OBSERVATION", path: `evidence[${index}].sourceObservationId`, message: `Evidence ${record.evidenceId} references missing observation ${record.sourceObservationId}.`, fatal: true });
      continue;
    }
    uniqueEvidence.set(record.evidenceId, structuredClone(record));
  }
  return { view: new EvidenceLedgerView([...uniqueObservations.values()], [...uniqueEvidence.values()]), issues };
}
