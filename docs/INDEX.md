# Secondary External Reality 文档索引

日期：2026-08-23

## 新上下文从这里开始

1. [README](../README.md)：产品、运行、测试与代码入口；
2. [完整上下文交接](CONTEXT-HANDOFF-2026-08-23.md)：当前架构、边界、验证事实和子任务协同；
3. [GWA 大结构研究](GWA-larger-architecture-study-after-v0.9.md)：长期架构纲领；
4. [Interaction IR active](MVP-interaction-ir-active-v1.0.md)：当前开放语言主链；
5. [最近放置语义加固](MVP-placement-grounding-hardening-v0.2.0.md)：最新真人失败与结构修复；
6. [最小空间与移动设计](MVP-minimal-space-movement-design-v0.3.md) 与 [里程碑记录](MILESTONE-minimal-space-movement-v0.3.0.md)：`move` 原语、床边/门口两个 Place、自动化人类模拟测试层；
7. [Layer A 验收测试设计与完成记录](MVP-layer-a-acceptance-tests-design-v1.0.md)：Query Confluence/Closure Integrity/Minimal Resolution/Replay Consistency，Layer A 骨架的结构化验收，含两个真实抓到的 bug。

## GWA 原文与对齐审计

- `GWA-v0.3a-dual-layer.txt`：双层架构原文；
- `GWA-v0.3a-P1-P6c-FROZEN-total-patch.txt`：冻结原则补丁；
- `GWA-Core-v0.3b-CMWF-1-formal-consensus.md.docx`：formal consensus 原文；
- `GWA-countersignature-patch-v0.3b-CMWF1.docx`：countersignature 补丁；
- [GWA 大结构研究](GWA-larger-architecture-study-after-v0.9.md)；
- [世界基础粗审计](GWA-world-foundation-rough-audit-v0.6.md)；
- [世界基础加固结果](GWA-world-foundation-hardening-v0.6.md)。

## 现行架构文档

- [MVP 架构决策 v0.1](MVP-architecture-decisions-v0.1.md)；
- [世界内核协议](MVP-world-kernel-protocol-v0.1.md)；
- [Canonical Epistemic Kernel 总设计](MVP-canonical-epistemic-kernel-plan-v1.0.md)；
- [设计审查](MVP-canonical-epistemic-kernel-design-review-v1.0.md)；
- [Phase 1：规范类型与兼容重放](MVP-canonical-epistemic-kernel-phase1-v1.0.md)；
- [Phase 2：Query Triage 与严格呈现](MVP-canonical-epistemic-kernel-phase2-v1.0.md)；
- [Human-facing Semantic Closure](MVP-human-semantic-closure-phase2.1-v1.0.md)；
- [对抗性语言门禁](MVP-adversarial-language-gate-phase2.2-v1.0.md)；
- [会话指代合同](MVP-discourse-contract-phase2.3-v1.0.md)；
- [统一 Live Gate](MVP-unified-live-gate-phase2.4-v1.0.md)；
- [真人测试就绪](MVP-guided-human-readiness-phase2.5-v1.0.md)。

## Interaction IR 演进

- [Interaction IR 设计](MVP-interaction-ir-v1.0-design.md)；
- [Shadow Round 1](MVP-interaction-ir-shadow-round1-v1.0.md)；
- [持久化 Shadow](MVP-interaction-ir-persistent-shadow-v1.0.md)；
- [Guard](MVP-interaction-ir-guard-v1.0.md)；
- [Active](MVP-interaction-ir-active-v1.0.md)；
- [Scoped perception 加固](MVP-scoped-perception-hardening-v0.2.0.md)；
- [Human Round 3 状态序列](MVP-human-round3-sequence-results-v0.2.0.md)；
- [放置语义与实体落地加固](MVP-placement-grounding-hardening-v0.2.0.md)。

## 已完成里程碑

- [世界基础 v0.6](MILESTONE-world-foundation-v0.6.0.md)，tag `mvp-world-foundation-v0.6.0`；
- [Open Action IR v0.7](MILESTONE-open-action-ir-v0.7.0.md)，tag `mvp-open-action-ir-v0.7.0`；
- [Bounded Open World v0.8](MILESTONE-bounded-open-world-v0.8.0.md)，tag `mvp-bounded-open-world-v0.8.0`；
- [Open Semantic IR v0.9](MILESTONE-open-semantic-ir-v0.9.0.md)，tag `mvp-open-semantic-ir-v0.9.0`；
- [最小空间与移动 v0.3.0](MILESTONE-minimal-space-movement-v0.3.0.md)（未打 tag）。

## 纵向切片与历史实施记录

- LanceDB、卧室、纸条记忆：`MVP-LanceDB-persistence-v0.1.md`、`MVP-bedroom-vertical-slice-v0.1.md`、`MVP-paper-memory-vertical-slice-v0.1.md`；
- 通用对象操作：`MVP-generic-object-operations-{plan-v0.1,v0.1,v0.2}.md`；
- 动作序列：`MVP-action-sequences-{plan-v0.3,v0.3}.md`；
- 回合审计：`MVP-turn-audit-*`；
- Open Action IR 分阶段记录：`MVP-open-action-ir-phase*-v0.7.md`；
- 旧计划文件用于解释决策历史，若与交接快照冲突，以当前代码、测试和交接快照为准。

## 真人与真实模型评测

- `Human-input-live-eval-phase2.1-round1.md`；
- `Human-input-live-eval-phase2.1-round2.md`；
- [引导式人测 Round 2](MVP-guided-human-exploration-round2.md)；
- [人测加固 Round 1](MVP-human-test-hardening-round1.md)；
- Workers AI benchmark：`Workers-AI-model-benchmark-round-1.md` 至 `round-4-protocol.md`；
- Workers AI jury benchmark：`Workers-AI-model-benchmark-jury-round-1.md`。

## 维护规则

- 根 README 只保留最新用户入口与架构概览；
- `CONTEXT-HANDOFF-2026-08-23.md` 是本轮压缩恢复的权威快照；
- 新里程碑报告记录日期、commit/tag、准确测试命令、结果和未实现边界；
- 计划和实施结果分开；完成后不要让旧计划继续冒充当前状态；
- 禁止在文档中复制 token、Authorization header、真实 secret 或未脱敏世界内容。
