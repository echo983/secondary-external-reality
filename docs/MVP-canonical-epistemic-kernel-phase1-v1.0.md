# MVP v1.0 Phase 1 实施记录：规范类型与兼容重放

日期：2026-08-23  
状态：完成

## 结果

Phase 1 已在不改变现有 turn、renderer、SSH、`CommitPackage` 写入格式和 LanceDB 历史的前提下，建立规范承诺与认识内核的只读地基。

新增能力仅供重放和审计：

- 严格 `SemanticAddress` parser/formatter 与显式 legacy upgrade；
- `ProjectionCommitment`、typed Observation/Evidence/Acquisition 等长期语义合同；
- legacy commits 的确定性适配；
- `CommitmentGraphView`、`EvidenceLedgerView`、`AgentEpistemicGraphView`；
- strict/diagnostic 两种 canonical replay；
- `LanceCommitStore.replayCanonicalViews()` 只读入口。

运行时尚未读取这些视图来决定玩家响应，也没有实现 Query Triage、Stable Realizer、MSRC、`fiber_mark` 或 presentation receipt。

## 兼容边界

### 存储不迁移

现有 `CommitPackage` 仍是 v0.x 存储 DTO，`world_commits.package_json`、package hash、row schema 和 `list()` 行为均未修改。新模块只消费 `list()` 返回的历史。

### Legacy 不冒充新证明

旧 `resolvedProjections` 只进入 `legacy_fixed`：

- 可安全升级的旧实体字段可取得 canonical address，但仍标为 snapshot；
- `action_outcome.*` 分类为 action resolution，不伪装成实体属性；
- 无法安全识别的地址产生结构化 issue；
- 不生成 operator、dependency closure 或 MSRC certificate。

当前真实 `.world` 没有 persisted `resolvedProjections`，因此实际统计为零 legacy fixed projection。

### 认识来源

旧 evidence 通过已有 source event 和 acquisition 生成确定性 synthetic observation/acquisition ID。旧 `observations: unknown[]` 不被猜测性解释。

Evidence 不保存 agent availability；Agent Epistemic Graph 只从 acquisition edge 构造主体可用路径。当前 schema 下只有 `person` entity 取得认识主体能力，普通物体即使存在也不能获得 epistemic edge。

## 实现模块

- `src/world/semanticAddress.ts`
- `src/world/commitmentTypes.ts`
- `src/world/commitmentGraph.ts`
- `src/epistemic/types.ts`
- `src/epistemic/evidenceLedger.ts`
- `src/epistemic/agentGraph.ts`
- `src/replay/legacyCanonicalAdapter.ts`
- `src/replay/canonicalReplay.ts`
- `src/storage/lanceCommitStore.ts`（仅新增只读 helper）

## 自动验证

基线：Node `v20.19.2`，118/118。

完成时：133/133，覆盖：

- 三类规范地址 round-trip 和不安全 token 拒绝；
- legacy 地址分类与 synthetic ID 稳定；
- adapter 输入不被修改、顺序无关；
- 重复、悬空和不支持记录的结构化 issues；
- legacy fixed 同值合并、异值冲突；
- evidence/observation 与 acquisition/evidence 引用完整性；
- agent A/B 认识隔离和非 person 能力拒绝；
- defensive copy；
- strict/diagnostic replay；
- LanceDB close/reopen、并发只读和原始 packages 不变。

## 真实历史只读验收

对 `.world/world.lancedb` 只读验收：

- tables：`action_proposals`、`turn_attempts`、`world_commits`；
- world table version：11 → 11；
- world rows：11 → 11；
- commit sequence：0–10；
- canonical observations：33；
- canonical evidence：33；
- Agent Epistemic edges：33；
- legacy fixed projections：0；
- canonical replay issues：0；
- package-hash 聚合：读取前后相同；
- 未输出玩家文本、evidence value 或 secret。

## 已知限制

- Phase 1 是只读视图，尚未让新提交原生写 typed records；
- legacy adapter 把旧 acquisition 按旧协议解释为 direct perception，保留 `legacy` provenance；
- 当前 EpistemicAgent 能力以 `person` 类型作为封闭 MVP 规则，未来应改为显式 capability；
- entity-presence evidence 尚无独立 proposition address，只能按 evidence ID/observation 检索；
- AEG 不等于 MemoryTrace，不提供 `knows()`、遗忘、误忆或置信度；
- diagnostic issues 不会自动修复历史。

## Phase 2 门禁状态

Phase 1 自身门禁通过。进入 Phase 2 前仍需执行设计中约定的准入审查，重点确认：

- typed Observation 是否覆盖现有观察动作；
- AEG 查询是否能阻止 WorldTruth 直读泄露；
- renderer strict packet 与 deterministic fallback 的统一输入；
- boundary 是否保持零事实解析；
- evidence consultation 不被呈现成记忆；
- transient percept 与 PersistentWorldEvent 的界线。
