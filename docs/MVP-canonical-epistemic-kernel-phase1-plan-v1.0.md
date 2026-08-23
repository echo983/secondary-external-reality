# MVP v1.0 Phase 1 实施计划：规范类型与兼容重放

日期：2026-08-23  
状态：待实施  
上位设计：`MVP-canonical-epistemic-kernel-plan-v1.0.md`  
阶段门禁：`MVP-canonical-epistemic-kernel-design-review-v1.0.md`

## 1. 本阶段结果

Phase 1 完成后，系统应能在**不改变现有写入、动作、SSH 输出和世界行为**的前提下，从 v0.9 及更早历史构造三份严格、可重建的只读视图：

- `CommitmentGraphView`：明确哪些旧投影只能称为 `legacy_fixed`，哪些新式规范承诺以后可进入完整闭包；
- `EvidenceLedgerView`：把旧 evidence 适配成具有稳定 observation 来源的规范证据；
- `AgentEpistemicGraphView`：把旧 `epistemicChanges` 适配成稳定 acquisition edge。

本阶段的价值不是增加玩家能力，而是证明未来迁移不会重写历史、伪造证明或打破当前 118 项基线行为。

## 2. 硬范围

### 允许修改

- 新增规范类型、地址 parser/formatter 和只读 replay/view 模块；
- 新增 legacy adapter；
- 为 `LanceCommitStore` 增加只读、无副作用的规范 replay 入口；
- 新增测试与只读诊断；
- 必要的导出和文档修正。

### 禁止修改

- 不改变 `CommitPackage` 的现有必填字段；
- 不让当前 turn 生成新式 projection commitment、typed observation 或 acquisition；
- 不修改 `rowFromPackage()`、commit hash、旧 LanceDB 行或 world basis；
- 不切换 renderer 输入；
- 不实现 Query Triage、epistemic boundary、Stable Realizer、MSRC、`fiber_mark` 或 presentation receipt；
- 不更改现有自然语言输出；
- 不为旧记录臆造 operator、dependency closure、记忆或“已证明知识”。

若实施过程中发现必须违反以上任一条才能继续，Phase 1 应停止并修订设计，而不是扩大范围。

## 3. 兼容策略

### 3.1 保持存储 DTO 不动

`src/protocol/types.ts` 中现有 `CommitPackage` 在本阶段继续代表 v0.x 存储 DTO。`LanceCommitStore.list()` 的返回类型和行为保持不变，所有现有调用方继续读取原对象。

新增规范类型放在独立模块中，不把一批 optional v1 字段直接塞入旧 DTO。这样避免“类型允许了，但 validator/store 尚未守住”的半迁移状态。

### 3.2 新增 replay 边界

```text
CommitPackage[] (legacy storage DTOs)
             │
             └── LegacyCanonicalAdapter
                        │
                        ├── CommitmentGraphView
                        ├── EvidenceLedgerView
                        └── AgentEpistemicGraphView
```

adapter 是唯一理解旧字段形状的地方。新 view 不得在内部继续读取 `observations: unknown[]` 或旧 evidence shape。

### 3.3 不把所有旧 resolved projection 当成新事实

当前历史中至少存在三类旧 projection：

- `entity:<id>.<attribute>`：可能是可变状态的 revision snapshot；
- `relation:<id>.active`：可能是某时刻的关系条件；
- `entity:self.action_outcome.*`：动作求值结果，不应自动成为永久实体属性。

因此 Phase 1 只生成：

```ts
interface LegacyFixedProjection {
  sourceAddress: string;
  canonicalAddress?: SemanticAddress;
  value: JsonScalar;
  fixedAtCommitSequence: number;
  classification:
    | "immutable_candidate"
    | "mutable_state_snapshot"
    | "action_resolution"
    | "unclassified";
  provenance: "legacy_fixed";
}
```

只有地址可安全规范化时才提供 `canonicalAddress`。`legacy_fixed` 保证同一 source address 不得出现不同值，但不宣称具有 operator、MSRC 或 closure certificate。

### 3.4 旧 evidence 的确定性 synthetic identity

旧 evidence 已有 `evidenceId` 和 `sourceEventId`，但没有 observation ID。adapter 生成：

```text
legacy-observation:<commit-sequence>:<base64url-utf8-evidence-id>
legacy-acquisition:<commit-sequence>:<index>:<base64url-utf8-agent-id>
```

具体编码使用 UTF-8 bytes 的无填充 base64url，并由测试固定；不能直接字符串拼接未经限制的历史 ID。synthetic ID 只存在于 replay view，不回写数据库。

旧 evidence 的 observation kind 从封闭映射取得：

- `entity_observed` → `entity_presence`；
- `attribute_observed` → `attribute_perception`；
- `relation_observed` → `relation_perception`。

遇到未知 kind、缺字段、重复 ID、悬空 event/evidence/agent 引用时，严格 replay 返回结构化 corruption issue；不猜测修复。现有合法历史必须零 issue。

## 4. 计划新增的数据合同

### 4.1 `src/world/semanticAddress.ts`

职责：

- 定义 `SemanticAddress` branded string；
- parse/format `entity:<id>.attribute:<name>`、`relation:<id>.active`、`relation-slot:<id>.<predicate>`；
- token 约束 `[a-z0-9_-]+`；
- canonical round-trip；
- 单独提供 `tryUpgradeLegacyAddress()`，不让规范 parser 接受旧语法。

失败使用带 code 的 `SemanticAddressError`，不依赖英文 message 做逻辑判断。

### 4.2 `src/world/commitmentTypes.ts`

只定义长期语义类型：

- `JsonScalar`；
- `ProjectionSupport`；
- `ProjectionSpecification`；
- `ProjectionCommitment`；
- `CommitmentProvenanceRecord`；
- `LegacyFixedProjection`；
- corruption/compatibility issue union。

本阶段不提供创建新 `ProjectionCommitment` 的 production factory，防止上游提前写新事实。

### 4.3 `src/epistemic/types.ts`

定义：

- typed `ObservationRecord` union；
- canonical `EvidenceRecord`；
- `EpistemicAcquisition`；
- `EpistemicEdge`；
- legacy marker/source reference；
- replay issue code。

Evidence 不含 agent availability；availability 只由 acquisition/edge 表达。

### 4.4 `src/replay/legacyCanonicalAdapter.ts`

职责：

- 输入 readonly `CommitPackage[]` 与 admitted seed commitments/entity catalog；
- 按 `commitSequence` 排序并检查连续性；
- 规范化可安全升级的地址；
- 分类旧 projection；
- 将旧 evidence/epistemic change 变成 canonical replay records；
- 产生结构化 issues；
- 不修改输入，不访问 LLM，不访问 wall-clock，不读 query 文本。

输出：

```ts
interface CanonicalReplayInput {
  legacyFixedProjections: LegacyFixedProjection[];
  observations: ObservationRecord[];
  evidence: CanonicalEvidenceRecord[];
  acquisitions: EpistemicAcquisition[];
  issues: ReplayIssue[];
}
```

### 4.5 三个只读 view

`src/world/commitmentGraph.ts`

- 以 canonical/source address 索引 legacy fixed projection；
- 检测同地址异值；
- 区分 classification；
- 不把 mutable snapshot 输出为 immutable commitment。

`src/epistemic/evidenceLedger.ts`

- evidence ID 全局唯一；
- observation/source occurrence 引用完整；
- 返回 defensive copy/read-only 查询结果。

`src/epistemic/agentGraph.ts`

- acquisition ID 唯一；
- agent/evidence 引用完整；
- 支持 `evidenceFor(agentId, propositionAddress)`；
- 不提供 `knows(): boolean`；
- 不做 memory、confidence 或 conflicting-evidence 合并。

### 4.6 聚合入口

建议新增 `src/replay/canonicalReplay.ts`：

```ts
replayCanonicalViews(
  commits: readonly CommitPackage[],
  options: { seedCommitments: readonly WorldCommitment[] }
): {
  commitments: CommitmentGraphView;
  evidence: EvidenceLedgerView;
  epistemic: AgentEpistemicGraphView;
  issues: ReplayIssue[];
}
```

默认严格模式在 issues 非空时抛出 `CanonicalReplayError`；测试/诊断模式可返回 issues。seed commitments 用于以现有 `MaterializedWorld` 规则验证 agent/entity 引用，并必须与 commit 中声明的 world basis 相容。生产代码在 Phase 1 不接入 turn path，只由测试和只读 store helper 调用。

## 5. 工作包与执行顺序

### W0：建立基线

操作：

1. 确认工作区只包含计划文档改动；
2. `npm test`，记录测试数量和 Node 版本；
3. 对当前 `.world` 仅调用 `store.list()`，记录 commit 数、序列范围和 package hash，不打印玩家文本、证据值或 secret；
4. 不修改或复制 `secret/`。

门槛：基线失败则先诊断，不能把既有失败算作 Phase 1 回归。

### W1：SemanticAddress 与类型

改动：

- 新建 `src/world/semanticAddress.ts`；
- 新建 `src/world/commitmentTypes.ts`；
- 新建 `src/epistemic/types.ts`；
- 新建 `test/semantic-address.test.ts`。

测试：

- 三种规范地址 round-trip；
- 大小写、空 token、Unicode、`.`、`:`、路径样式和多余分隔符拒绝；
- legacy `entity:self.position` 只能经 upgrade 函数转换；
- `entity:self.action_outcome.stand_now` 分类为 action resolution，而不是普通 attribute；
- parser/formatter 无 query/locale 依赖。

提交候选：`feat: add canonical semantic address contracts`

### W2：Legacy adapter

改动：

- 新建 `src/replay/legacyCanonicalAdapter.ts`；
- 新建 `test/legacy-canonical-adapter.test.ts`；
- 在 `test/fixtures/` 增加人工最小 JSON fixture；不得提交真实 `.world` 数据。

fixture 至少覆盖：

- 无 `worldBasis` 的早期 commit；
- v0.9 inscription observation/evidence/acquisition；
- mutable attribute snapshot；
- relation active condition；
- action outcome resolution；
- 空 observations/evidence；
- synthetic ID 中包含需要编码的 legacy ID。

测试：

- 同一输入多次 replay byte-for-byte 等价；
- 输入顺序打乱后按 sequence 得到同一输出；
- adapter 不修改输入对象；
- 未知/悬空/重复记录产生稳定 issue code；
- 不从 `observations: unknown[]` 猜 evidence；旧 observation 仅作为 legacy raw audit 保留或忽略，规范 observation 由已有 evidence/source event 映射。

提交候选：`feat: adapt legacy commits to canonical replay records`

### W3：只读视图

改动：

- 新建 `src/world/commitmentGraph.ts`；
- 新建 `src/epistemic/evidenceLedger.ts`；
- 新建 `src/epistemic/agentGraph.ts`；
- 新建对应三个测试文件。

测试：

- legacy fixed 同地址同值合并、异值报错；
- mutable state snapshot 不冒充 immutable commitment；
- evidence/source observation 完整性；
- acquisition/evidence/agent 引用完整性；
- agent A 与 agent B 查询隔离；
- 返回值无法修改 view 内部状态；
- 不暴露 `knows=true` 便捷接口。

提交候选：`feat: add replayable commitment and epistemic views`

### W4：聚合 replay 与 store 只读入口

改动：

- 新建 `src/replay/canonicalReplay.ts`；
- 为 `LanceCommitStore` 增加接收 `seedCommitments` 的 `replayCanonicalViews()` 或等价只读 helper；
- helper 内部先使用现有 `list()`，不得新增/修改 LanceDB table；
- 新建 `test/canonical-replay.test.ts`；
- 扩充 `test/lance-commit-store.test.ts`。

测试：

- append → close → reopen → canonical replay 等价；
- 删除内存 view 后重建等价；
- helper 调用前后 table version、row count、package hash 不变；
- 旧 `list()` 深度相等行为不变；
- corruption strict mode 失败，diagnostic mode 返回 issues；
- 多次并发只读不创建表、不争用 writer sequence。

提交候选：`feat: expose read-only canonical replay from LanceDB history`

### W5：真实历史只读验收与阶段报告

操作：

1. 完整 `npm test`；
2. 对当前 `.world` 执行只读 canonical replay；
3. 只报告统计：commit/evidence/acquisition/legacy classification 数量与 issue codes；
4. 验证 replay 前后 LanceDB table names/version/row count/package hashes 不变；
5. 若发现 legacy issue，先判断是 adapter 缺陷还是既有历史损坏，禁止自动修复；
6. 落盘 `MVP-canonical-epistemic-kernel-phase1-v1.0.md` 实施记录。

最终提交候选：`docs: record canonical epistemic kernel phase 1`

## 6. Replay issue 注册表

第一版至少冻结以下 code，message 可改善但 code 不改义：

- `NON_CONTIGUOUS_COMMIT_SEQUENCE`；
- `DUPLICATE_EVENT_ID`；
- `DUPLICATE_OBSERVATION_ID`；
- `DUPLICATE_EVIDENCE_ID`；
- `DUPLICATE_ACQUISITION_ID`；
- `MISSING_EVIDENCE_EVENT`；
- `MISSING_EVIDENCE_OBSERVATION`；
- `MISSING_ACQUISITION_EVIDENCE`；
- `MISSING_EPISTEMIC_AGENT`；
- `LEGACY_ADDRESS_UNCLASSIFIED`；
- `LEGACY_FIXED_VALUE_CONFLICT`；
- `UNSUPPORTED_LEGACY_EVIDENCE_KIND`；
- `INVALID_LEGACY_RECORD_SHAPE`。

是否把 `LEGACY_ADDRESS_UNCLASSIFIED` 设为 fatal 必须按用途区分：它不能进入 canonical lookup，但不应阻止 MaterializedWorld 继续重放旧历史。strict canonical replay 可失败，普通 `store.list()` 仍保持原行为。

## 7. 测试矩阵

| 边界 | 单元测试 | 集成测试 | 真实历史只读 |
|---|---|---|---|
| 地址唯一与 round-trip | W1 | W4 | W5 |
| legacy 分类 | W2 | W4 | W5 |
| synthetic ID 稳定 | W2 | W4 reopen | W5 两次 replay |
| fixed 值冲突 | W3 | W4 strict mode | 只报告，不修复 |
| evidence 引用 | W3 | W4 store | W5 |
| agent 隔离 | W3 | W4 | 统计，不输出内容 |
| 无写副作用 | — | W4 table/hash | W5 table/hash |
| v0.9 行为回归 | — | 全量 `npm test` | SSH 不要求启动 |

## 8. 失败与回滚边界

- W1–W4 都只新增模块和只读 helper；任一步失败可以回退该步而不迁移数据；
- 不运行 schema rewrite、table drop、repair 或 destructive git 命令；
- 不对 `.world` 做“规范化保存”；
- adapter 不能理解的记录只产生 issue，不落盘补丁；
- 如果必须更改旧 package hash 才能通过，视为设计失败；
- 如果规范 replay 需要当前 query、语言或 LLM，视为设计失败；
- 如果 view 与旧 `MaterializedWorld` 对同一已提交实体事实产生不同值，停止 Phase 1 并落盘冲突样例。

## 9. Phase 1 完成定义

全部成立才完成：

1. 基线全部测试通过，新增测试通过；
2. v0.9 及人工早期 fixtures 可确定性 replay；
3. 当前 `.world` 完成只读 replay，或所有 issue 已明确归类且不存在静默猜测；
4. 旧 `LanceCommitStore.list()`、append、hash 和单写者行为不变；
5. 三个 view 可从空缓存重建；
6. agent evidence 查询有主体隔离；
7. legacy projection 不被伪装成具有新式 operator/MSRC certificate；
8. 没有运行时 turn、renderer、SSH 输出变化；
9. 工作区无 secret 或 `.world` 数据进入 git；
10. 实施记录列出测试数量、真实历史只读统计和已知限制。

## 10. Phase 2 准入检查

Phase 1 完成后，开始 Phase 2 前再审一次：

- typed Observation 是否足以覆盖现有 look/inventory/contents/locate/read；
- AEG 查询是否无需 WorldTruth 值泄露；
- renderer strict packet 如何兼容确定性 fallback；
- boundary 是否可在不提交观察事件的情况下返回；
- legacy evidence consultation 的呈现用语是否保持“证据”而非“记忆”；
- 哪些旧 observation commits 应继续保留、哪些新 transient percept 可不进入 PersistentWorldEvent。

只有这次准入审查通过，才允许把只读 view 接入真实 turn path。
