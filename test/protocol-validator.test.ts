import assert from "node:assert/strict";
import test from "node:test";

import { shouldInvokeJury, validateCandidateEnvelope } from "../src/protocol/validator.js";
import type { CandidateEnvelope, ProjectionDefinition } from "../src/protocol/types.js";

const registry: ProjectionDefinition[] = [
  {
    address: "entity:self.capability.reach",
    state: "unknown",
    allowedValues: ["sufficient", "insufficient"],
  },
  {
    address: "entity:door.open_state",
    state: "known",
    allowedValues: ["open", "closed"],
    value: "closed",
  },
  {
    address: "entity:self.unsupported_magic",
    state: "unsupported",
    allowedValues: [],
  },
];

function validEnvelope(): CandidateEnvelope {
  return {
    candidates: [
      {
        candidateId: "c1",
        outcomeKind: "success",
        requiresResolution: [
          { projection: "entity:self.capability.reach", reason: "Needed to reach the door." },
        ],
        conditions: [
          { projection: "entity:self.capability.reach", operator: "eq", value: "sufficient" },
          { projection: "entity:door.open_state", operator: "eq", value: "closed" },
        ],
        proposedEvents: [
          {
            eventId: "event-open-result",
            type: "action_result",
            actionKind: "open",
            outcome: "success",
            subjectRef: "self",
            objectRef: "door",
          },
        ],
        proposedStateChanges: [
          {
            projection: "entity:door.open_state",
            from: "closed",
            to: "open",
            causedByEventId: "event-open-result",
          },
        ],
        observations: [],
        newWorldCommitments: [],
      },
    ],
  };
}

function codes(input: unknown): string[] {
  return validateCandidateEnvelope(input, registry).issues.map((entry) => entry.code);
}

test("accepts a fully constituted conditional success", () => {
  const result = validateCandidateEnvelope(validEnvelope(), registry);
  assert.deepEqual(result, { valid: true, issues: [] });
  assert.equal(shouldInvokeJury(result, 1), true);
});

test("rejects an unknown condition projection", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.conditions[0]!.projection = "self posture=sitting";
  assert.ok(codes(envelope).includes("UNKNOWN_PROJECTION"));
});

test("rejects a requested projection that is not used", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.conditions = envelope.candidates[0]!.conditions.slice(1);
  assert.ok(codes(envelope).includes("UNUSED_RESOLUTION"));
});

test("rejects an unknown condition that was not requested", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.requiresResolution = [];
  assert.ok(codes(envelope).includes("UNDECLARED_CONDITION"));
});

test("rejects values outside a projection domain", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.conditions[0]!.value = "probably";
  assert.ok(codes(envelope).includes("VALUE_OUTSIDE_DOMAIN"));
});

test("rejects free-text event facts and unknown event types", () => {
  const envelope = validEnvelope() as unknown as { candidates: Array<Record<string, unknown>> };
  envelope.candidates[0]!.proposedEvents = [
    { eventId: "e1", type: "admit", facts: ["guard has_never_seen self"] },
  ];
  const resultCodes = codes(envelope);
  assert.ok(resultCodes.includes("UNKNOWN_EVENT_TYPE"));
  assert.ok(resultCodes.includes("FREE_TEXT_EVENT_FACTS"));
});

test("rejects mutually exclusive social responses", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.outcomeKind = "partial";
  envelope.candidates[0]!.proposedEvents = [
    { eventId: "e1", type: "social_response", responseKind: "admit" },
    { eventId: "e2", type: "social_response", responseKind: "deny_entry" },
  ];
  envelope.candidates[0]!.proposedStateChanges = [];
  assert.ok(codes(envelope).includes("MUTUALLY_EXCLUSIVE_EVENTS"));
});

test("rejects success without a successful result and state change", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.proposedEvents = [
    { eventId: "e1", type: "action_attempt", actionKind: "open" },
  ];
  envelope.candidates[0]!.proposedStateChanges = [];
  assert.ok(codes(envelope).includes("UNCONSTITUTED_SUCCESS"));
});

test("rejects state changes without a causal event", () => {
  const envelope = validEnvelope();
  envelope.candidates[0]!.proposedStateChanges[0]!.causedByEventId = "missing";
  assert.ok(codes(envelope).includes("MISSING_CAUSE_EVENT"));
});

test("does not invoke the jury for invalid or empty eligible candidates", () => {
  const invalid = validateCandidateEnvelope({ candidates: [{}] }, registry);
  const valid = validateCandidateEnvelope(validEnvelope(), registry);
  assert.equal(shouldInvokeJury(invalid, 1), false);
  assert.equal(shouldInvokeJury(valid, 0), false);
});
