# MVP v1.0：规范承诺与认识内核设计

日期：2026-08-23  
状态：设计稿，尚未实施  
依据：`GWA-larger-architecture-study-after-v0.9.md`、GWA v0.3a + P1/P6c、GWA v0.3b CMWF-1

## 1. 里程碑目标

v1.0 建立一个最小的 Canonical Commitment & Epistemic Kernel，使系统第一次能够诚实处理“世界支持、但尚未预写死”的事实：

> 同一个 Supported+Free 投影，在不同自然语言和查询顺序下只解析一次；解析结果先成为规范承诺，主体再通过合法观察获得证据；以后重放得到同一世界事实，而未取得证据的主体不能从 WorldTruth 直接获知它。

这不是完整 GWA，也不是开放式 LLM 世界生成。它是后续空间、人物、记忆和更多动作共享的承重层。

## 2. 范围与非目标

### 本里程碑包含

- 稳定 `SemanticAddress`；
- Supported+Free 与 Supported+Fixed 的投影生命周期；
- commitment root、dependency、exposure provenance 的最小模型；
- typed Observation、Evidence、EpistemicAcquisition；
- 可由 commits 重放的最小 Agent Epistemic Graph；
- Query Triage 的三条确定性出口；
- schema 驱动的最小 MSRC；
- approved presentation packet；
- query confluence、closure integrity、epistemic boundary 和 replay 验收。

### 明确不包含

- LLM 直接选择世界事实；
- 通用逻辑求解器或无限域解析；
- 复杂 MemoryTrace、遗忘、误忆；
- NPC 证言、信念置信度和 Explanation Refactoring；
- 通用社会关系、城市生成和宏观历史；
- 为提高动作数量而大规模扩充原语；
- 分布式共识。LanceDB 仍运行于现有单机单写者边界。

## 3. 必须保持的不变量

### K1 Commit Before Expose

Free 投影必须经过 resolve、closure validation 和 atomic commit，之后才能进入 observation/evidence 和 player-facing packet。renderer 输出不得反向补写事实。

### K2 Query Path Invariance

纯揭示查询的措辞、顺序或入口可以改变呈现，不能改变同一 `SemanticAddress` 的值。

### K3 Causal Selection Barrier

当前 query 原文、玩家愿望和叙事效用不得成为过去/静态潜在事实的 realization 输入。允许输入仅来自已提交 world basis、规范地址、版本化 operator 和其已提交依赖。

### K4 Epistemic Boundary

WorldTruth 中存在某值，不等于某主体知道该值。player-facing packet 中的事实必须由本回合合法 observation，或主体已有的 epistemic edge 支持。

### K5 Closure Integrity

任何已提交语义后果依赖的 world-semantic 投影都必须已经固定，并进入 dependency closure。Procedural Ephemeral Value 不进入该闭包。

### K6 Minimal Commitment

首次解析只能提交本次操作的最小充分闭包，不能顺便生成同一实体的无关字段。

### K7 Monotonic History

已固定投影不换值；暴露只增加 provenance/load，不改变值；物化视图可重建，历史记录不可静默覆盖。

## 4. 权威层次

```text
World basis + append-only commit packages + presentation receipts
                  │
                  ├── replay → Canonical World / Commitment Graph
                  ├── replay → Event + Evidence Ledger
                  └── replay → Agent Epistemic Graph

Query Triage reads the three views
                  │
                  └── approved player-facing packet → renderer → SSH
```

权威仍是 seed/basis 加追加 commit。`MaterializedWorld`、Commitment Graph 和 Agent Epistemic Graph 都是可重建视图。LanceDB 中可以为查询增加派生表或索引，但不得让派生表拥有事实裁决权。

`presentation_receipts` 是唯一例外的第二份追加式权威日志：它只裁决某个已提交 packet 是否确认送达，从而增加 exp provenance/Load，不裁决或改变世界值。它必须引用既存 `packetId`，并与 world writer 使用同一进程/文件锁边界。

## 5. 核心数据模型

以下是语义合同，不要求第一阶段立即按同名 TypeScript 类型实现。

```ts
type JsonScalar = string | number | boolean | null;
```

### 5.1 SemanticAddress

MVP 地址语法保持封闭、可规范化且不含用户措辞：

```text
entity:<entity-id>.attribute:<attribute-name>
relation:<relation-id>.active
relation-slot:<subject-id>.<predicate>
```

规则：

- 地址锚定稳定实体 ID 和 schema token；
- 不使用自然语言名称、query 顺序或临时数组索引；
- 同义 query 必须绑定到同一地址；
- 地址 schema 带版本，升级时显式迁移，禁止静默改义。
- v1.0 的 ID/token 只允许封闭 ASCII token（`[a-z0-9_-]+`），从语法上排除分隔符歧义；未来若放宽必须先定义转义和规范化。

现有 `entity:<id>.<attribute>` 可以在兼容层继续读取，但新写入使用规范形式。

地址并不自动意味着“永恒不变”。v1.0 明确分开两类读模型：

- immutable latent projection：一旦解析，其值永久固定，进入 `ProjectionCommitment`；
- mutable current state：由 Event 推进的 `MaterializedWorld` 当前值，继续使用 revision/condition 并由历史查询定位时间。

本里程碑只让 `fiber_mark` 这类不可变潜在属性进入新 realization/commitment 流程。`open_state`、位置和 `relation.active` 不得误写成永久不变的 ProjectionCommitment；上面的 relation 地址仅供现有条件、观察命题和后续时态设计使用。

### 5.2 ProjectionSpecification

```ts
interface ProjectionSpecification {
  semanticAddress: string;
  support: "unsupported" | "supported";
  valueSchemaId: string;
  realizationOperatorId?: string;
  dependencyAddresses: string[];
}
```

`unsupported` 不允许 renderer 或 LLM 临时发明。`supported` 可以尚未解析，也可以已经固定。

### 5.3 ProjectionCommitment

```ts
interface ProjectionCommitment {
  semanticAddress: string;
  value: JsonScalar;
  determination: "counterfactually_fixed";
  roots: Array<"seed" | "mu" | "struct">;
  dependencyAddresses: string[];
  origin:
    | { kind: "realized"; operatorId: string; operatorVersion: string; realizationInputHash: string }
    | { kind: "authored"; basisRef: string };
  fixedAtCommitSequence: number;
}
```

MVP 不为 Free 投影写一条伪 commitment；Free 是 specification 存在且 replay 后无 commitment。roots 非互斥。第一次 realization 通常带 `mu`；后来成为其他事实的依赖或成功暴露时，通过追加 `CommitmentProvenanceRecord` 增加 `struct`/`exp`，不修改旧 commitment：

```ts
interface CommitmentProvenanceRecord {
  semanticAddress: string;
  root: "struct" | "exp";
  sourceRef: string;
  recordedAt: string;
}
```

replay 后的 effective roots 是原 commitment roots 与全部 provenance records 的并集；`exp` 只能来自成功送达后的 receipt/provenance，不能预先放进首次 commitment。

### 5.4 Typed Observation

替换长期接口中的 `observations: unknown[]`：

```ts
type ObservationRecord =
  | { observationId: string; kind: "entity_presence"; observerId: string; entityIds: string[]; sourceOccurrenceId: string }
  | { observationId: string; kind: "attribute_perception"; observerId: string; semanticAddress: string; perceivedValue: JsonScalar; sourceOccurrenceId: string }
  | { observationId: string; kind: "relation_perception"; observerId: string; semanticAddress: string; perceivedValue: true; sourceOccurrenceId: string };
```

Observation 是“观察发生了什么”，Evidence 是由观察形成并可被认识路径引用的不可变记录。二者不能以一个松散 JSON 同时承担。

### 5.5 Evidence 与 EpistemicAcquisition

```ts
interface EvidenceRecord {
  evidenceId: string;
  propositionAddress: string;
  representedValue: JsonScalar;
  sourceObservationId: string;
}

interface EpistemicAcquisition {
  acquisitionId: string;
  agentId: string;
  evidenceId: string;
  mode: "direct_perception";
  acquiredAtCommitSequence: number;
}
```

本阶段仅实现 `direct_perception`。旧 evidence shape 通过读取兼容层重放；新提交使用新 schema version。

### 5.6 Agent Epistemic Graph

MVP 图只回答：某 agent 通过哪些 evidence 获得了哪个 proposition/value。

```ts
interface EpistemicEdge {
  agentId: string;
  propositionAddress: string;
  representedValue: JsonScalar;
  evidenceId: string;
  acquisitionId: string;
}
```

Evidence 自身不携带可用主体列表；可用性只由 append-only acquisition edge 表达，避免两份记录分歧。AEG 不声明终极“knows=true”，不合并矛盾 evidence，不做置信度推理。相同主体可持有多条来源；后续 memory/testimony/inference 可扩展 acquisition mode 而无需改 WorldTruth。

### 5.7 ApprovedPresentationPacket

```ts
interface ApprovedPresentationPacket {
  packetId: string;
  languageSample: string;
  outcome: "answer" | "boundary" | "action_result";
  visibleFacts: Array<{
    semanticAddress: string;
    value: JsonScalar;
    evidenceId?: string;
  }>;
  visibleOccurrences: string[];
  presentationHints: Array<{ kind: string; value: string }>;
}
```

renderer 只能收到这个 packet，不能收到 candidate explanation、jury score、rejected candidates、uncommitted values 或整个 `CommitPackage`。确定性 fallback renderer 也使用同一 packet。

## 6. Query Triage

### 输入

```ts
interface QueryRequest {
  observerId: string;
  semanticTarget: string;
  requestedMode: "perceive_now" | "consult_acquired_evidence";
  sceneContextRef: string;
  languageSample: string;
}
```

v1.0 的 semantic compiler 只提出该结构；本地 binder 生成最终 `semanticTarget`。LLM 不能直接提交任意地址。

### 三条路径

#### A. Fixed retrieval

投影已固定，且本回合可直接观察：读取 commitment，生成 observation → evidence → acquisition，再构造 answer packet。不得重新调用 realizer。

投影已固定但不可观察：若 AEG 已有对应且按 MVP policy 仍可用的 evidence，可走 `consult_acquired_evidence`；否则返回 epistemic boundary，不泄露值。

`consult_acquired_evidence` 是明确的 MVP 近似：它只检索持久 AEG edge，不声称发生了 MemoryTrace/retrieval/Recollection，也不模拟遗忘或误忆。对玩家的呈现只能说“你先前取得的证据显示……”，不得伪装成一次新的直接感知或高保真回忆。真正的“我记得什么”继续留到 MemoryTrace 阶段。

#### B. Free resolution

投影 supported 但尚 Free，且本回合具备合法观察路径：

1. 计算 MSRC；
2. 对闭包内每个 Free 地址调用 stable realizer；
3. 检查 schema、依赖、I1 和 expected revision；
4. 把 projection commitments 与 observation/evidence/acquisition 放入一个原子 commit；
5. commit 成功后才构造 answer packet。

#### C. Epistemic boundary

目标 unsupported、当前不可观察且主体无 evidence、或 commitment footprint 超出 v1.0 policy 时，返回结构化 boundary。Boundary 不得携带隐藏值，也不得为“没有答案”临时固定一个负事实。

### 本阶段暂不实现的出口

GWA 的 Zoom、Redirect、EntailedRefusal、ResolvedRefusal 保留为未来枚举。v1.0 只将现有行为归一为 `answer | epistemic_boundary | unsupported_boundary`，避免假装已经实现完整五出口定价。

## 7. Stable Realizer

第一版只支持有限、版本化 operator，不调用 LLM：

```text
value = F(
  worldBasis.seedHash,
  semanticAddress,
  operatorId,
  operatorVersion,
  committedDependencyValues
)
```

`realizationInputHash` 只覆盖上述规范输入的 canonical serialization，不能复用 turn、candidate 或 prompt hash。

硬性禁止把以下内容放入 F：

- raw query；
- input language；
- query/turn sequence；
- desired answer；
- renderer 或 jury 输出；
- 当前叙事效用分数。

同一输入必须产生同一候选值。真正随机的 operator 若以后加入，结果必须在首次解析事务中物化，不能声称可由随机过程重放。

## 8. MSRC 的 MVP 形式

不做通用证明器，使用 schema registry 的显式 closure template：

```ts
interface ResolutionClosureRule {
  valueSchemaId: string;
  requires: Array<
    | { kind: "entity_exists"; entityIdFromAddress: true }
    | { kind: "projection"; addressTemplate: string }
  >;
}
```

解析器对依赖做拓扑排序，拒绝环、缺失 specification、unsupported dependency 和未固定的语义依赖。事务记录最终 `dependencyAddresses`，存储层在 append 前重算并核对，不能只信上游声明。

v1.0 纵切面只选择无需创建新人物/历史事件的 attribute 投影，使 closure 保持可验证：实体存在 + 感知前置投影 + 目标属性。

## 9. 纵向验收场景

### 场景：纸条的潜在纤维标记

在 fixture 中给现有纸条注册一个 supported 但未取值的投影：

```text
entity:note-1.attribute:fiber_mark
domain = [triangle, circle, double_line, none]
operator = finite_hash_choice@1
```

它不是 inscription，不影响已完成的写藏数字用例。它代表纸张近看才能发现的微小制造标记。

完整序列：

1. 初始 replay：specification 存在，commitment 不存在，即 Free；
2. “这个纸条有什么纤维标记？”但纸条藏着：epistemic boundary，不解析、不泄露；
3. 找出纸条并近看：triage 认定可观察，realizer 只解析该投影及 MSRC；`none` 是该属性的一个合法固定值，不等于 unsupported；
4. 同一 commit 固定值并产生 observation/evidence/acquisition；
5. renderer 仅看到 approved packet；
6. 换中文/英文/不同措辞再次看：读取同一 Fixed 值，不再次解析；
7. 将纸条重新藏起后问“根据我先前取得的证据，是什么标记”：从 AEG 的既有 evidence 回答，并明确这是 evidence consultation；
8. 另一个没有 acquisition 的 agent 查询：不能获得该值；
9. 重启并 replay：World commitment 与 AEG 均恢复，回答不变；
10. 任意纯揭示查询排列：忽略“问题被问过”造成的 occurrence/evidence 顺序差异后，最终揭示的 canonical projection/value 子图同构。

`fiber_mark_presence` 是从 `fiber_mark != none` 得到的版本化、精确 canonical projection，不另行随机解析。存在性与具体值查询必须满足这一投影关系，作为本阶段的 Projective Consistency 样例。

## 10. 提交事务

### Candidate/CommitPackage 增量

候选需要增加：

- `projectionCommitments`；
- `observations` 的 typed union；
- `epistemicAcquisitions`；
- `presentationPacketDraft`，只引用候选中将被提交/批准的数据；
- `resolutionClosure` 与 operator provenance。

提交顺序：

```text
bind canonical target
→ replay current authoritative views
→ triage
→ calculate/recalculate MSRC
→ realize candidate values
→ deterministic validation
→ optional LLM semantic/experience audit
→ acquire writer lock
→ replay latest state and revalidate
→ finalize approved packet from validated candidate data
→ append facts/evidence/acquisition/approved packet in one atomic commit
→ render and deliver
→ append exposure receipt/provenance
```

### 暴露回执的诚实边界

网络输出和 LanceDB append 无法成为同一个原子事务。v1.0 使用稳定 `packetId` 和 outbox-like 状态：

- approved packet 在 writer lock 内从最终重检通过的数据生成，并与事实、evidence、acquisition 一同提交；不能在 append 后临时重建出另一个 packet；
- 成功写入 SSH 后追加 exposure receipt，增加 exp-root provenance；
- 重试不得生成新事实或新 packet；
- 崩溃可能留下“已批准但未确认送达”的 packet，不能据此断言玩家已看到；
- 极端的“socket 已送达但 receipt 未写入”作为单机 MVP 的诚实残余风险记录，不伪称 exactly-once delivery。

receipt 写入专用追加表 `presentation_receipts`，不伪装成一个空的世界回合，也不占用 `world_commits.commit_sequence`。CommitmentGraph replay 合并 receipts 只增加 provenance/Load；发现 receipt 指向不存在的 packet 必须报损坏。

## 11. LanceDB 与迁移策略

### 权威存储

继续沿用 `world_commits`，通过 commit schema version 加入新字段，确保一次 append 涵盖 world、evidence 与 epistemic 变化。这样保留现有单写者和哈希审计边界。

### 可重建视图

建议新增逻辑视图（初期可仅存在于内存）：

- `CommitmentGraphView`；
- `EvidenceLedgerView`；
- `AgentEpistemicGraphView`；
- `PresentationOutboxView`。

只有出现实际查询压力时才物化为 LanceDB 派生表。派生表每行带 source commit sequence/hash，可整表丢弃重建。

`presentation_receipts` 不是派生表，不能随缓存丢弃；它使用稳定 receipt ID、packet ID、commit package hash 和送达时间，并保持 append-only/idempotent。

### 兼容

- v0.9 历史 commits 必须继续 replay；
- 旧 `resolvedProjections` 映射为 fixed legacy projection，并标明 legacy provenance；
- legacy fixed projection 不伪造 operator、dependency 或 closure 证明；它进入显式 `legacy_fixed` 兼容区，只保持旧有稳定性，新语义后果若要依赖它必须先通过适配规则；
- 旧 evidence/epistemic change 由 adapter 以确定性 synthetic observation/acquisition ID 转成新只读视图，并标记 `legacy`；
- 新提交不再写 `observations: unknown[]`；
- 不原地重写用户已有历史。

## 12. 模块边界建议

```text
src/world/semanticAddress.ts       canonical parse/format
src/world/projectionRegistry.ts    specifications + closure rules
src/world/commitmentGraph.ts       replayed determination/root/dependency view
src/world/stableRealizer.ts        versioned deterministic realization
src/epistemic/evidenceLedger.ts    typed evidence replay
src/epistemic/agentGraph.ts        per-agent evidence paths
src/query/queryTriage.ts           three-path decision
src/presentation/approvedPacket.ts strict renderer input
```

这是职责建议，不要求一次重排现有所有 turn 文件。`objectTurn` 应逐步调用这些服务；不要在 v1.0 同时重写整个动作系统。

## 13. 实施阶段

### Phase 1：规范类型与兼容 replay

- SemanticAddress；
- ProjectionSpecification/Commitment；
- typed observation/evidence/acquisition；
- legacy adapters；
- CommitmentGraph/AEG replay tests。

完成条件：不改变现有人测行为，全部 v0.9 历史可重放。

### Phase 2：Query Triage 与 epistemic boundary

- fixed retrieval；
- current perception gate；
- existing evidence retrieval；
- unsupported/epistemic boundary；
- renderer 改为只收 approved packet。

完成条件：隐藏事实不能通过全局 world read 泄露，现有纸条读取不回归。

### Phase 3：一个 Supported+Free 纵切面

- stable realizer；
- schema closure template；
- fiber_mark 场景；
- 同事务 projection/evidence/acquisition；
- exposure receipt。

完成条件：首次查询固定一次，后续只读取；不可观察查询不触发解析。

### Phase 4：性质验收与真实 SSH

- query wording/order confluence；
- closure integrity；
- causal-selection negative tests；
- two-agent epistemic separation；
- restart/replay；
- 中英文真实 Workers AI semantic proposer/auditor + SSH。

完成条件：第 14 节门槛全部通过后才能标记 v1.0 milestone。

## 14. 验收门槛

### 确定性测试

1. 同地址首次解析只产生一个固定值和一个 μ-root；
2. 20 种 query 措辞和多种顺序得到同一投影值；
3. 改变 raw query、语言和 turn sequence 不改变 realizer 输出；
4. 不可见目标返回 boundary，commitment 数量不增加；
5. agent A 取得 evidence 后可检索，agent B 不可；
6. renderer 输入中不存在 explanation、jury report、uncommitted value；
7. 缺失 dependency、Free semantic dependency、closure 越界均拒绝 append；
8. 并发首次解析只有一个事务成功，另一方 replay 后读取同值；
9. 重启、丢弃派生视图并重建后结果一致；
10. v0.9 全套回归通过。

### 性质测试

- Query Confluence：纯揭示 query 的最终 exposed canonical subgraph 同构；
- Projective Consistency：本纵切面的存在/具体值两级投影回投一致；
- Minimal Resolution：fiber_mark 查询不固定其他未决属性；
- Closure Integrity：每个 committed semantic consequence 的依赖均 Fixed；
- Epistemic Non-Leakage：移除合法 evidence path 后 packet 无法包含隐藏值。

### 真实人测

- 中英文和自然改写均绑定同一目标；
- 藏起时问不到，实际近看后得到稳定标记；
- 再藏起后可以说出“刚才看到的标记”；
- 重启 SSH 后仍一致；
- 输出保持自然语言，不泄露 SemanticAddress、root、operator 或内部 boundary code。

## 15. 失败策略

- semantic binder 不确定：拒绝执行，不猜地址；
- unsupported：明确能力边界，不创造 specification；
- supported 但无合法 epistemic path：boundary，不解析；
- realizer/operator 缺失或版本不符：内部失败，不降级为 LLM 猜值；
- MSRC 超预算：boundary，且本阶段不创建 Redirect 实体；
- stable realizer 的值一旦由规范输入得出，不交给 LLM 选择、否决后重采样或换候选；schema/closure 合法性由确定性内核裁决。jury 不可用时，确定性内核场景可以按既有策略继续，确需 LLM 判断的开放候选失败关闭；
- renderer 不可用：使用只读同一 approved packet 的确定性 fallback；
- append 冲突：重新 replay/triage；不得沿用未提交的 realization 当作事实。

## 16. 完成定义

v1.0 完成不以新增多少自然语言动作衡量，而以以下边界是否成立衡量：

1. world fact 的确定与 agent 的获知是两笔不同但可原子关联的语义记录；
2. Free fact 只有在合法操作确实需要时才固定；
3. query 决定揭示位置，不决定潜在事实内容；
4. renderer 只能表达已经批准暴露的内容；
5. 所有权威状态都能由旧 basis 和追加 commits 重建；
6. LLM 可以理解和审计开放表达，但不能越过规范承诺边界。

达到这些条件后，下一阶段才适合把 PlaceGraph、移动、观察带宽、证言与最小 MemoryTrace 接到同一内核上。
