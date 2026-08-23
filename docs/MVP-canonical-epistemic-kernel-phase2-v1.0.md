# MVP v1.0 Phase 2：Query Triage、认识边界与严格呈现实施记录

日期：2026-08-23  
状态：完成

## 1. 结果

Phase 2 已把 MVP 固定事实查询接入规范认识链：本地绑定先经过 PerceptionPolicy 与 Query Triage，当前可感知事实才形成 typed observation/evidence/acquisition；不可感知且无既有证据时返回合法 boundary；存在本主体已取得证据时只呈现带 acquisition sequence 的历史证据，并明确不声称当前仍相同。

查询的玩家输出现在只由 `ApprovedPresentationPacket` 驱动。Workers AI renderer 仅接收 packet 与语言样本，不再接收 CommitPackage、WorldTruth、jury、state changes 或完整 ledger。

## 2. 已实施

- `relation_set_perception` 与 `complete_for_scope`，使空手和空容器成为有作用域的完整观察，而非由遗漏推断；
- `EpistemicEdge.acquiredAtCommitSequence`；
- 封闭 QueryRequest、QueryDecision、boundary code 与 presentation item union；
- optional `canonical` v1.0 commit envelope；
- append 前 canonical ID、引用、agent capability、presentation provenance 和 dual-write 等价验证；
- native-first、legacy-compatible canonical replay；
- PerceptionPolicy 与 fixed Query Triage，policy 不返回隐藏值；
- committed / evidence / boundary 回合结果分离；
- boundary 与 evidence consultation 都是零 world commit，并分别记为 `boundary` / `presented` attempt；
- inscription presence/value、locate、inventory、inspect contents、look around、read/find 的 native canonical dual-write；
- deterministic 与 Workers AI 查询 renderer 共用 packet-only 接口；
- prior evidence 的表述明确区分历史证据与当前事实。

## 3. 主要不变量

- 查询不能决定或改写潜在世界事实；
- 关闭容器不会生成空集合证据；
- complete empty relation set 才能支持 scoped absence；
- presentation 中的 entity、relation set 与 evidence 必须在同一 canonical envelope 获准；
- legacy 与 canonical evidence/acquisition 不一致时 append 失败；
- agent A 的 acquisition 不可供 agent B 查阅；
- renderer 无 MaterializedWorld 或 EvidenceLedger 读取能力；
- boundary 和 evidence consultation 均不增加 world commit sequence；
- 旧历史无需迁移或重写。

## 4. 验收

- Node：v20.19.2；
- 自动测试：142/142；
- hidden target、closed container、empty scoped set、agent isolation、latest evidence、renderer information-flow、native/legacy replay、restart 与既有动作均有回归覆盖；
- 真实 `.world/world.lancedb` 只读 strict replay：11 commits（sequence 0–10）、33 observations、33 evidence、33 epistemic edges、0 issues；
- 验收未打印玩家事实值，未写入真实世界。

## 5. 明确未进入本阶段

- Supported+Free realization、Stable Realizer、MSRC 与 `fiber_mark`；
- MemoryTrace、遗忘、误忆与 recollection；
- exposure receipt/outbox；
- 多地点、NPC 与社会证言；
- 将物理动作 renderer 全部迁移为 packet-only。

物理动作仍走原有 commit-first 路径；本阶段收紧的是全部已迁移的事实查询。Phase 3 不得以 query 原文、语言或叙事效用作为 Free fact 的取值输入。
