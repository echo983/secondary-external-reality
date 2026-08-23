import type { ApprovedPresentationPacket } from "./types.js";
import { createObjectWorldFixture } from "../world/objectFixture.js";
import { ReferenceLexicon } from "../world/referenceLexicon.js";

export interface ApprovedPresentationRenderer { render(packet: ApprovedPresentationPacket, languageSample: string): Promise<string> }

export class RiskAwarePresentationRenderer implements ApprovedPresentationRenderer {
  constructor(private readonly lowRisk: ApprovedPresentationRenderer, private readonly deterministic = new DeterministicPresentationRenderer()) {}

  async render(packet: ApprovedPresentationPacket, languageSample: string): Promise<string> {
    const highRisk = packet.outcome === "boundary" || packet.items.some((item) =>
      item.kind === "boundary" || item.kind === "prior_evidence" || item.kind === "attribute_evidence" ||
      (item.kind === "bounded_relation_set" && item.subjectIds.length === 0),
    );
    if (highRisk) return this.deterministic.render(packet, languageSample);
    const rendered = await this.lowRisk.render(packet, languageSample);
    return this.isGroundedRendering(rendered, packet) ? rendered : this.deterministic.render(packet, languageSample);
  }

  private isGroundedRendering(rendered: string, packet: ApprovedPresentationPacket): boolean {
    const fixture = createObjectWorldFixture();
    const lexicon = new ReferenceLexicon(fixture);
    if (fixture.names.some(({ entityId }) => rendered.includes(entityId))) return false;
    const required = new Set<string>();
    for (const item of packet.items) {
      if (item.kind === "observed_entities") item.entityIds.forEach((id) => required.add(id));
      if (item.kind === "bounded_relation_set") {
        if (item.objectId !== "self") required.add(item.objectId);
        item.subjectIds.forEach((id) => required.add(id));
      }
      if (item.kind === "relation_evidence") {
        const subject = String(item.semanticAddress).match(/^relation-slot:([^.]+)\./u)?.[1];
        if (subject) required.add(subject);
        if (typeof item.value === "string" && fixture.names.some(({ entityId }) => entityId === item.value)) required.add(item.value);
      }
    }
    const normalized = rendered.toLocaleLowerCase();
    return [...required].every((entityId) => lexicon.names(entityId).some((alias) => normalized.includes(alias.toLocaleLowerCase())));
  }
}

export class DeterministicPresentationRenderer implements ApprovedPresentationRenderer {
  async render(packet: ApprovedPresentationPacket, languageSample: string): Promise<string> {
    const lexicon = new ReferenceLexicon(createObjectWorldFixture());
    const name = (id: string): string => lexicon.label(id, packet.language);
    const relation = packet.items.find((entry) => entry.kind === "relation_evidence");
    const attribute = packet.items.find((entry) => entry.kind === "attribute_evidence");
    if (relation?.kind === "relation_evidence" && attribute?.kind === "attribute_evidence" && /读|read/iu.test(languageSample)) {
      const place = name(String(relation.value));
      const value = String(attribute.value);
      return packet.language === "zh" ? `你在${place}${String(relation.semanticAddress).endsWith("contained_by") ? "下面" : "那里"}找到纸条。上面写着“${value}”。` : `You find the note ${String(relation.semanticAddress).endsWith("contained_by") ? `inside the ${place}` : "there"} and read “${value}”.`;
    }
    const item = packet.items[0];
    if (!item) return packet.language === "zh" ? "你没有获得可呈现的信息。" : "You acquired no presentable information.";
    if (item.kind === "boundary") {
      const zh = { TARGET_NOT_PERCEIVABLE: "你现在无法感知到目标。", CONTAINER_CLOSED: "容器关着，你现在看不到里面。", NO_ACQUIRED_EVIDENCE: "你没有可供查阅的既有证据。", UNSUPPORTED_PROJECTION: "当前世界还不能回答这个问题。", RESOLUTION_DEFERRED: "这个事实目前尚未固定。", AMBIGUOUS_TARGET: "你指的目标不够明确。" } as const;
      const en = { TARGET_NOT_PERCEIVABLE: "You cannot currently perceive the target.", CONTAINER_CLOSED: "The container is closed, so you cannot see inside.", NO_ACQUIRED_EVIDENCE: "You have no acquired evidence to consult.", UNSUPPORTED_PROJECTION: "The current world cannot answer that yet.", RESOLUTION_DEFERRED: "That fact has not yet been fixed.", AMBIGUOUS_TARGET: "The target is ambiguous." } as const;
      return packet.language === "zh" ? zh[item.code] : en[item.code];
    }
    if (item.kind === "observed_entities") return packet.language === "zh" ? `你环顾四周，可以看到：${item.entityIds.map(name).join("、")}。` : `You look around and can see: ${item.entityIds.map(name).join(", ")}.`;
    if (item.kind === "bounded_relation_set") {
      const names = item.subjectIds.map(name);
      if (item.predicate === "held_by") return packet.language === "zh" ? (names.length ? `你手里拿着：${names.join("、")}。` : "你手里没有拿着东西。") : (names.length ? `You are holding: ${names.join(", ")}.` : "You are not holding anything.");
      return packet.language === "zh" ? (names.length ? `${name(item.objectId)}里面有：${names.join("、")}。` : `${name(item.objectId)}里面是空的。`) : (names.length ? `Inside the ${name(item.objectId)} you see: ${names.join(", ")}.` : `The ${name(item.objectId)} is empty.`);
    }
    if (item.kind === "prior_evidence") {
      const value = String(item.evidence.value ?? "");
      return packet.language === "zh" ? `你此前获得的证据记录为“${value}”（取得于提交序号 ${item.acquiredAtCommitSequence}）；这不证明它现在仍然相同。` : `Your previously acquired evidence recorded “${value}” at commit sequence ${item.acquiredAtCommitSequence}; this does not establish that it is still current.`;
    }
    const evidence = item;
    if (evidence.kind === "attribute_evidence") {
      const value = String(evidence.value ?? "");
      if (String(evidence.semanticAddress) === "entity:self.attribute:position") return packet.language === "zh" ? `你在${value === "bedside" ? "床边" : value}。` : `You are ${value === "bedside" ? "beside the bed" : value}.`;
      if (String(evidence.semanticAddress) === "entity:self.attribute:posture") return packet.language === "zh" ? (value === "sitting_on_bed_edge" ? "你正坐在床沿。" : `你的姿势是${value}。`) : (value === "sitting_on_bed_edge" ? "You are sitting on the edge of the bed." : `Your posture is ${value}.`);
      const presence = /有字|writing on/iu.test(languageSample);
      return packet.language === "zh" ? (value ? (presence ? "纸条上有字。" : `纸条上写着“${value}”。`) : "纸条上没有字。") : (value ? (presence ? "There is writing on the note." : `The note reads “${value}”.`) : "There is no writing on the note.");
    }
    const objectId = String(evidence.value);
    const subjectId = String(evidence.semanticAddress).match(/^relation-slot:([^.]+)\./u)?.[1] ?? "object";
    return packet.language === "zh" ? `${name(subjectId)}在${name(objectId)}${String(evidence.semanticAddress).endsWith("held_by") ? "手里" : String(evidence.semanticAddress).endsWith("contained_by") ? "里面" : "上"}。` : `The ${name(subjectId)} is ${String(evidence.semanticAddress).endsWith("held_by") ? "in your hand" : String(evidence.semanticAddress).endsWith("contained_by") ? `inside the ${name(objectId)}` : `on the ${name(objectId)}`}.`;
  }
}
