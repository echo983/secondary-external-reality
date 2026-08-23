import type { ApprovedPresentationItem } from "../presentation/types.js";
import type { CanonicalCommitEnvelopeV1, EvidenceRecord } from "../protocol/types.js";
import { entityAttributeAddress, relationSlotAddress } from "../world/semanticAddress.js";

export interface CompleteRelationSetInput { predicate: "contained_by" | "held_by"; objectId: string; subjectIds: string[]; sourceEventId: string }

export function buildCanonicalQueryEnvelope(options: {
  turnId: string; commitSequence: number; language: "zh" | "en"; evidence: readonly EvidenceRecord[];
  presentationItems: ApprovedPresentationItem[]; completeRelationSet?: CompleteRelationSetInput;
}): CanonicalCommitEnvelopeV1 {
  const observations: CanonicalCommitEnvelopeV1["observations"] = [];
  const evidence: CanonicalCommitEnvelopeV1["evidence"] = [];
  const acquisitions: CanonicalCommitEnvelopeV1["acquisitions"] = [];
  for (const legacy of options.evidence) {
    const observationId = `canonical-observation:${legacy.evidenceId}`;
    if (legacy.kind === "entity_observed") {
      observations.push({ observationId, kind: "entity_presence", observerId: "self", entityIds: [legacy.subjectId], sourceOccurrenceId: legacy.sourceEventId, provenance: "canonical" });
      evidence.push({ evidenceId: legacy.evidenceId, representedValue: [legacy.subjectId], sourceObservationId: observationId, provenance: "canonical" });
    } else if (legacy.kind === "attribute_observed" && legacy.attribute && legacy.value !== undefined) {
      const address = entityAttributeAddress(legacy.subjectId, legacy.attribute);
      observations.push({ observationId, kind: "attribute_perception", observerId: "self", semanticAddress: address, perceivedValue: legacy.value, sourceOccurrenceId: legacy.sourceEventId, provenance: "canonical" });
      evidence.push({ evidenceId: legacy.evidenceId, propositionAddress: address, representedValue: legacy.value, sourceObservationId: observationId, provenance: "canonical" });
    } else if (legacy.kind === "relation_observed" && legacy.predicate && legacy.objectId) {
      const address = relationSlotAddress(legacy.subjectId, legacy.predicate);
      observations.push({ observationId, kind: "relation_perception", observerId: "self", semanticAddress: address, perceivedValue: legacy.objectId, sourceOccurrenceId: legacy.sourceEventId, provenance: "canonical" });
      evidence.push({ evidenceId: legacy.evidenceId, propositionAddress: address, representedValue: legacy.objectId, sourceObservationId: observationId, provenance: "canonical" });
    }
    acquisitions.push({ acquisitionId: `canonical-acquisition:${legacy.evidenceId}`, agentId: "self", evidenceId: legacy.evidenceId, mode: "direct_perception", acquiredAtCommitSequence: options.commitSequence, provenance: "canonical" });
  }
  if (options.completeRelationSet) {
    const set = options.completeRelationSet;
    const observationId = `canonical-relation-set:${options.turnId}`;
    const evidenceId = `canonical-relation-set-evidence:${options.turnId}`;
    observations.push({ observationId, kind: "relation_set_perception", observerId: "self", predicate: set.predicate, objectId: set.objectId, subjectIds: [...set.subjectIds], completeness: "complete_for_scope", scopeRef: { kind: "relation_object", predicate: set.predicate, objectId: set.objectId }, sourceOccurrenceId: set.sourceEventId, provenance: "canonical" });
    evidence.push({ evidenceId, representedValue: [...set.subjectIds], sourceObservationId: observationId, provenance: "canonical" });
    acquisitions.push({ acquisitionId: `canonical-acquisition:${evidenceId}`, agentId: "self", evidenceId, mode: "direct_perception", acquiredAtCommitSequence: options.commitSequence, provenance: "canonical" });
  }
  return { schemaVersion: "1.0", observations, evidence, acquisitions, presentationPacket: { packetId: `packet:${options.turnId}`, outcome: "answer", language: options.language, items: structuredClone(options.presentationItems) } };
}
