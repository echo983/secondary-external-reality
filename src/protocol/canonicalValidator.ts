import type { CanonicalCommitEnvelopeV1, ValidationIssue } from "./types.js";

export interface CanonicalValidationOptions {
  commitSequence: number;
  eventIds: ReadonlySet<string>;
  knownAgentIds: ReadonlySet<string>;
}

export function validateCanonicalEnvelope(envelope: CanonicalCommitEnvelopeV1, options: CanonicalValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string): void => { issues.push({ code, path, message }); };
  if (envelope.schemaVersion !== "1.0") add("UNSUPPORTED_CANONICAL_VERSION", "canonical.schemaVersion", "Canonical schema version must be 1.0.");
  const observations = new Map<string, CanonicalCommitEnvelopeV1["observations"][number]>();
  envelope.observations.forEach((observation, index) => {
    if (!observation.observationId || observations.has(observation.observationId)) add("DUPLICATE_CANONICAL_OBSERVATION", `canonical.observations[${index}].observationId`, "Observation IDs must be non-empty and unique.");
    else observations.set(observation.observationId, observation);
    if (!options.eventIds.has(observation.sourceOccurrenceId)) add("MISSING_CANONICAL_OCCURRENCE", `canonical.observations[${index}].sourceOccurrenceId`, "Observation must reference an event in this commit.");
    if (observation.kind === "relation_set_perception" && (observation.completeness !== "complete_for_scope" || observation.scopeRef.predicate !== observation.predicate || observation.scopeRef.objectId !== observation.objectId)) {
      add("INVALID_RELATION_SET_SCOPE", `canonical.observations[${index}]`, "Complete relation-set scope must match its predicate and object.");
    }
  });
  const evidence = new Map<string, CanonicalCommitEnvelopeV1["evidence"][number]>();
  envelope.evidence.forEach((record, index) => {
    if (!record.evidenceId || evidence.has(record.evidenceId)) add("DUPLICATE_CANONICAL_EVIDENCE", `canonical.evidence[${index}].evidenceId`, "Evidence IDs must be non-empty and unique.");
    else evidence.set(record.evidenceId, record);
    if (!observations.has(record.sourceObservationId)) add("MISSING_CANONICAL_OBSERVATION", `canonical.evidence[${index}].sourceObservationId`, "Evidence must reference an observation in this envelope.");
  });
  const acquisitions = new Set<string>();
  envelope.acquisitions.forEach((acquisition, index) => {
    if (!acquisition.acquisitionId || acquisitions.has(acquisition.acquisitionId)) add("DUPLICATE_CANONICAL_ACQUISITION", `canonical.acquisitions[${index}].acquisitionId`, "Acquisition IDs must be non-empty and unique.");
    acquisitions.add(acquisition.acquisitionId);
    if (!evidence.has(acquisition.evidenceId)) add("MISSING_CANONICAL_EVIDENCE", `canonical.acquisitions[${index}].evidenceId`, "Acquisition must reference evidence in this envelope.");
    if (!options.knownAgentIds.has(acquisition.agentId)) add("INVALID_CANONICAL_AGENT", `canonical.acquisitions[${index}].agentId`, "Acquisition agent lacks epistemic capability.");
    if (acquisition.acquiredAtCommitSequence !== options.commitSequence) add("INVALID_ACQUISITION_SEQUENCE", `canonical.acquisitions[${index}].acquiredAtCommitSequence`, "Acquisition sequence must equal its commit sequence.");
  });
  const packet = envelope.presentationPacket;
  if ((packet.outcome === "boundary") !== packet.items.every((item) => item.kind === "boundary")) add("INVALID_PRESENTATION_OUTCOME", "canonical.presentationPacket", "Boundary packets contain only boundary items; answer packets contain none.");
  for (const [index, item] of packet.items.entries()) {
    const approvedEvidence = item.kind === "attribute_evidence" || item.kind === "relation_evidence" ? item : item.kind === "prior_evidence" ? item.evidence : undefined;
    if (approvedEvidence && !evidence.has(approvedEvidence.evidenceId)) add("UNAPPROVED_PRESENTATION_EVIDENCE", `canonical.presentationPacket.items[${index}]`, "Presentation evidence must be present in the canonical envelope.");
    if (approvedEvidence) {
      const source = evidence.get(approvedEvidence.evidenceId);
      if (source && (source.propositionAddress !== approvedEvidence.semanticAddress || JSON.stringify(source.representedValue) !== JSON.stringify(approvedEvidence.value))) add("PRESENTATION_EVIDENCE_MISMATCH", `canonical.presentationPacket.items[${index}]`, "Presentation evidence must exactly match its canonical record.");
    }
  }
  return issues;
}
