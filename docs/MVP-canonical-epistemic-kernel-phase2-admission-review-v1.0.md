# MVP v1.0 Phase 2 准入审查

日期：2026-08-23  
审查对象：Query Triage、认识边界与严格呈现包  
结论：**有条件准入；先完成 P0 合同修订，再迁移运行路径。**

## 1. 已满足的前置条件

- Phase 1 canonical replay 已完成，134/134；
- 当前真实历史 33 条 evidence/acquisition 可零 issue 重放；
- Commitment/Evidence/AEG 三个视图可从 LanceDB 历史无副作用重建；
- `SemanticAddress` 不依赖自然语言措辞；
- 现有 hidden-object 规则已能阻止部分 WorldTruth 直接泄露；
- 所有 Phase 2 改造可以保持在当前单机单写者边界内。

## 2. P0 发现

### P0-1：现有 typed Observation 不能表达有界负证据

`entity_presence` 按单实体记录，`relation_perception` 只表达一个正关系。它们无法区分：

- 没有观察到钥匙；
- 已完整检查打开的抽屉，确认其内容集合为空；
- 当前手中物品集合为空；
- 观察带宽不足，不能判断是否为空。

这一区分直接决定 GWA 中 Boundary 与固定负事实的成本。Phase 2 必须增加带 scope/completeness 的集合观察，例如：

```ts
interface RelationSetObservation {
  kind: "relation_set_perception";
  observerId: string;
  predicate: "contained_by" | "held_by";
  objectId: string;
  subjectIds: string[];
  completeness: "complete_for_scope";
  scopeRef: string;
}
```

空数组只有在 `complete_for_scope` 且 scope 合法时才构成“此处为空”的 evidence。普通 omission 不构成 absence。

### P0-2：对象查询绕过 renderer 合同

`runObjectTurn()` 在 commit 前构造自然语言 `response`，commit 后直接返回；`TurnRenderer` 只用于旧 bedroom 纵切面。即使把 Workers renderer 改成 strict packet，大部分人测路径仍会绕过它。

Phase 2 必须把 look/inventory/contents/locate/inscription/read 的响应迁移为：

```text
candidate facts/evidence
→ commit
→ approved packet built from committed package
→ deterministic or LLM renderer
```

禁止保留“先拼 response，再提交事实”的第二条正式路径。

### P0-3：boundary 当前由异常承担，无法表示成功的零提交查询结果

隐藏对象和关闭容器目前抛出 `ObjectTurnError`，session 将其记录为失败 attempt。认识边界不是系统故障，也不应伪造一个 world commit。

Phase 2 需要显式 `TurnBoundaryResult`：包含稳定 code、同语言 presentation packet、零 commit。action sequence 必须把它视为当前步骤的非提交终止，而不是 partial world success。

### P0-4：AEG edge 缺少取得时间

同一可变属性可能先后产生不同 evidence，例如纸条先为空、后来写入数字。当前 `EpistemicEdge` 没有 acquisition sequence，consultation 无法稳定区分历史证据顺序。

Phase 2 前先把 `acquiredAtCommitSequence` 带入 edge。consultation 只能说“你在序列 N 取得的证据显示……”，不能把旧 evidence 当作当前 WorldTruth。

## 3. P1 发现

### P1-1：需要区分当前感知与证据咨询

两者可以呈现同一个值，但 provenance 不同：

- `perceive_now` 必须通过当前可见性/容器/能力检查，并可产生新 observation/evidence/acquisition；
- `consult_acquired_evidence` 只读 AEG，不产生新的直接感知，也不声称 MemoryTrace/recollection。

### P1-2：Phase 2 需要原生记录，但不能破坏 v0.x DTO

建议为 `CommitPackage` 增加一个可选、版本化 `canonical` envelope，而不是替换旧字段：

```ts
canonical?: {
  schemaVersion: "1.0-phase2";
  observations: ObservationRecord[];
  evidence: CanonicalEvidenceRecord[];
  acquisitions: EpistemicAcquisition[];
  approvedPresentationPacket: ApprovedPresentationPacket;
}
```

迁移中的观察回合 dual-write 旧字段与 canonical envelope；store 在 append 前验证两者语义对应。canonical replay 优先读取 envelope，旧 commit 才走 adapter。完成迁移后再讨论停止旧写。

### P1-3：renderer packet 不能携带裸内部值集合

packet 必须使用有限 player-facing item union，例如 observed entity list、bounded empty set、attribute evidence、boundary reason。不能把整个 evidence ledger、commit package 或任意 `presentationHints: {kind,value}` 开放给 LLM。

### P1-4：当前可见性是函数，不是可审计认识路径

`isVisible()` 已有正确的小世界逻辑，但散落在 `objectTurn.ts`。Phase 2 应提取为确定性 `PerceptionPolicy`，输出允许的 scope/target，而不是直接输出事实值。Query Triage 使用其裁决“能否观察”，随后 WorldTruth reader 才读取目标。

### P1-5：认识主体能力仍是临时类型规则

Phase 1 以 `person` 作为 EpistemicAgent 门槛。Phase 2 可继续沿用，但必须集中在 policy/registry，不能在 query 代码里重复硬编码。显式 capability 留到后续 schema 升级。

## 4. 准入范围

Phase 2 允许迁移的读取能力：

- `look_around`；
- `inventory`；
- `inspect_contents`；
- `locate`；
- `inspect_inscription_presence`；
- `inspect_inscription_value`；
- `read` 中的 find/read evidence 部分；
- 一条明确的 `consult_acquired_evidence` 语义入口。

暂不迁移：

- stand/move/open 的 body feedback；
- 所有物理状态改变动作；
- Free projection resolution；
- memory/recollection；
- presentation receipt。

物理动作仍可保留旧 response 路径，但所有**事实查询**必须在 Phase 2 完成时走 triage + approved packet。Phase 3 开始前再统一动作结果 renderer。

## 5. 准入门禁

开始运行路径迁移前必须先满足：

1. `RelationSetObservation` 等有界集合观察合同和测试落地；
2. AEG edge 带 acquisition sequence；
3. `ApprovedPresentationPacket` 使用封闭 item union；
4. `TurnBoundaryResult` 与 action sequence 语义固定；
5. native canonical envelope validator 能拒绝旧/新双写分歧；
6. `PerceptionPolicy` 从 WorldTruth value reader 分开；
7. renderer TypeScript 接口不能接收 `CommitPackage`。

满足后，Phase 2 可以实施。未满足时不得以 prompt 约束代替类型边界。

## 6. 最终意见

Phase 2 方向正确，且 Phase 1 提供了足够的 replay 基础。但它不是简单地“在 objectTurn 里查询 AEG”：必须先补负证据、零提交 boundary 和统一呈现路径三个结构缺口。

结论为：**允许制定并执行 Phase 2 计划；计划必须先做合同层，再做只读查询迁移，最后做 renderer 切换与人测。**
