# MVP v1.0 Phase 2.1：Human-facing Semantic Closure 实施记录

日期：2026-08-23  
状态：完成

## 1. 人测问题与修复

首轮 SSH 人测暴露的结构问题已完成加固：

- `TARGET_NOT_PERCEIVABLE` 曾被 LLM 改写成“你在何处”：现由 risk-aware renderer 强制 boundary、prior evidence、exact attribute 与 scoped empty set 走确定性呈现；
- renderer 输出“便签”但 binder 不认识：新增共享 `ReferenceLexicon`，`便签/便签纸/sticky note` 成为纸条的批准别名，完整 label 优先避免“床头柜”同时误命中“床”；
- “我在哪里”走普通实体 visibility：新增封闭 SelfQuery，从 `self.position` / `self.posture` 形成 canonical evidence；
- “你好”、残句、门外和任意文字写入均表现为理解失败：新增 interface-only 分类、专用回应与 attempt audit，保持零 world commit；
- “便签呢”无法续接：新增会话内 exposed-entity discourse context，显式别名省略可续接，但执行前仍重新经过 Query Triage。

## 2. 已建立的不变量

- 高风险 presentation 永不委托给 LLM；
- 系统 canonical label 可稳定 round-trip 到同一 entity ID；
- 完整别名优先于短别名 substring，复合动作仍可识别多个实体；
- self query 不依赖普通物体可见性；
- “我在床上吗”只报告明确 posture“坐在床沿”，不伪造未建模 relation；
- conversation、fragment、unsupported scope/capability 写 interface attempt，不写 world commit；
- discourse context 不是 WorldTruth、Evidence 或 MemoryTrace；
- 已暴露实体后来隐藏时，省略引用仍无法绕过 PerceptionPolicy。

## 3. 验收

- 自动测试：148/148；
- 覆盖 boundary renderer 不调用 LLM、prior evidence 时态、label round-trip、床/床头柜冲突、SelfQuery、四类 interface-only 输入、exposed alias 续接及隐藏后重新裁决；
- 真实 `.world/world.lancedb` 只读 strict replay：11 commits（sequence 0–10）、33 observations、33 evidence、33 epistemic edges、0 issues；
- 未写入或迁移真实世界，未输出真实玩家 evidence value。

## 4. 有意保留的边界

- 任意文字书写仍未开放，只给出准确 capability boundary；
- 门外空间与 PlaceGraph 未实现；
- discourse context 暂不跨进程持久化，也不称为记忆；
- 无显式实体别名的自由代词仍可能需要后续更严格的 discourse ranking；
- LLM 继续可用于低风险正向呈现，但不拥有事实、边界或命名权。

Phase 2.1 完成后，可以重新进行短轮人测；若人类语义闭环稳定，再设计 Phase 3 Stable Realizer 与首个 Supported+Free 纵向探针。
