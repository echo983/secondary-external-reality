# MVP v1.0 规范承诺与认识内核：设计审查

日期：2026-08-23  
审查对象：`MVP-canonical-epistemic-kernel-plan-v1.0.md`  
结论：**有条件通过；修订项已并入设计稿，可以进入 Phase 1，不能跳阶段。**

## 1. 审查方法

本次从四个角度检查：

- GWA v0.3a + P1/P6c 与 v0.3b CMWF-1 的语义一致性；
- 当前 `CommitPackage`、`MaterializedWorld`、validator 和 LanceDB 单写者的真实边界；
- 老历史无损重放与新增 schema 的迁移风险；
- 纵向用例能否真正证明 query independence、epistemic boundary 和 commit-before-expose。

## 2. 已修正的 P0 问题

### P0-1：不可变潜在事实与可变当前状态混型

原设计的 SemanticAddress 同时举了 attribute、`relation.active`，但 ProjectionCommitment 又要求值永久固定。这会让“门当前打开”或者“关系当前有效”无法被后续合法 Event 改变。

修正：明确区分 immutable latent projection 与 Event-derived mutable current state。v1.0 的 realizer/ProjectionCommitment 只接收 `fiber_mark` 一类不可变潜在属性；`open_state`、位置、关系 active 继续走 MaterializedWorld revision 和历史事件。未来时态投影另行设计。

### P0-2：approved packet 没有真正处于提交事务内

原顺序是 append 后再构造 packet，但文字又声称 packet 已在暴露前提交。append 后重新构造会留下信息流差异和无法审计的呈现输入。

修正：在 writer lock 内最终重检后生成 packet，并与事实、evidence、acquisition 原子写入同一个 commit；renderer 读取已提交 packet。

### P0-3：Evidence availability 与 Acquisition 双写

两处同时记录“哪个 agent 可用”必然可能分歧。

修正：Evidence 只记录内容与来源；主体可用性唯一由 append-only acquisition edge 表达。

### P0-4：把 AEG 查询称为记忆

原 `recall_existing` 和“我刚才看到什么”在没有 MemoryTrace/retrieval 的情况下违反“perceived ≠ remembered”。

修正：更名为 `consult_acquired_evidence`，输出必须表述为先前证据，不声称回忆。真正记忆仍不在 v1.0 范围内。

## 3. 已修正的 P1 问题

### P1-1：旧 resolved projection 无法伪造新闭包证明

旧历史没有 operator、依赖闭包和规范地址版本，直接映射成完整新 ProjectionCommitment 会制造不存在的证明。

修正：显式 `legacy_fixed` 兼容区；只保持旧值稳定。新事实若依赖旧投影，必须经过适配规则。

### P1-2：operator provenance 不适合 authored/seed value

原类型强制每个 commitment 都有 realizer operator，无法诚实表示 fixture authored facts。

修正：origin 改为 `realized | authored`；realization hash 明确不能复用包含 query 的 turn/prompt hash。

### P1-3：SemanticAddress 分隔符未定义

若实体 ID 可包含 `.`、`:`，同一字符串可能有多种解析。

修正：v1.0 token 限制为 `[a-z0-9_-]+`；放宽前必须先定义转义与 canonicalization。

### P1-4：Query Confluence 比较范围过宽

问题被问过本身可能产生不同 occurrence/evidence 顺序。GWA V1 只要求 revelation 部分合流。

修正：比较 canonical projection/value 子图，忽略合法的 query occurrence、evidence 顺序差异。

### P1-5：存在性与具体值缺乏投影关系

domain 中包含 `none`，但设计没有说明“有没有标记”和“是什么标记”如何满足 Projective Consistency。

修正：`fiber_mark_presence` 是 `fiber_mark != none` 的版本化精确 canonical projection，不独立采样。

### P1-6：LLM 审计可能形成重采样侧门

若 jury 因“不喜欢这个确定值”否决，然后重新 realization，query/narrative utility 会间接选择潜在过去。

修正：stable realizer 的值只由确定性 schema/closure 裁决，不允许 LLM 否决后重采样或换值。LLM 只审查语义忠实度和需要经验判断的开放候选。

### P1-7：exposure receipt 无法塞入现有世界回合而不污染序号

网络送达与 LanceDB 不能原子化，且现有 `world_commits` 每行是完整 CommitPackage。把 receipt 伪装为空回合会污染 world sequence 与 validator 语义。

修正：使用 append-only、idempotent `presentation_receipts` 权威日志，只记录已提交 packet 的送达并增加 exp provenance/Load，不改变 WorldTruth，也不占 world commit sequence。它与 world writer 共用锁；孤儿 receipt 视为损坏。

## 4. 保留的风险与实施护栏

### R1：两份追加日志不具备跨表原子事务

这是刻意接受的单机边界。事实 commit 必须先成功，receipt 后写；绝不能反序。最坏情况是少记一次 exposure，而不是暴露未提交事实。必须通过稳定 packet/receipt ID 保证重试幂等，并在里程碑报告中保留 socket-delivered/receipt-missing 风险。

### R2：AEG 的持久可用性仍是简化

v1.0 会把 direct acquisition 作为可持续查询的认识边，但没有编码质量、遗忘和误忆。接口与呈现必须始终称为 acquired evidence，避免以后把这一简化误当作完整人类记忆。

### R3：fiber_mark 是架构探针，不是产品能力

这个属性刻意人工且有限，目的是证明生命周期，不应扩张成大量装饰性随机字段。通过验收后，下一条真实投影应来自 PlaceGraph/观察带宽等有业务意义的纵切面。

### R4：legacy adapter 是高风险区

不能重写现有 LanceDB 历史，也不能让 synthetic IDs 与新 ID 碰撞。Phase 1 必须先做 fixture commits 与真实现存 `.world` 的 replay fixture，并证明 adapter deterministic。

### R5：`none` 是固定负事实，有语义成本

realizer 得到 `none` 仍产生 μ-root；不能把它当作免费的 boundary。只有 unsupported 或无认识路径才是不解析目标的 boundary。

## 5. 阶段门禁审查

### Phase 1 → Phase 2

必须先满足：

- 所有旧 commits 可无损读取；
- 新旧地址不会碰撞；
- legacy synthetic IDs 稳定；
- CommitmentGraph 与 AEG 可从空缓存重建；
- 当前 118 项回归保持通过。

### Phase 2 → Phase 3

必须先满足：

- renderer 的 TypeScript 接口已经不能接收完整 CommitPackage；
- hidden fact non-leakage 测试成立；
- evidence consultation 与 current perception 在类型和文案上分开；
- boundary 路径不会触发 resolver。

### Phase 3 → Phase 4

必须先满足：

- stable realizer 输入可审计且不含 query/turn 字段；
- MSRC 在 store append 时重算；
- 并发首次解析测试通过；
- presentation receipt 幂等且不能引用不存在 packet。

任何门禁失败都应留在当前 Phase 修复，不以真实 LLM 或 SSH 演示覆盖。

## 6. 最终意见

修订后的设计范围合理，且与现有工程有一条低风险迁移路径：先建立兼容 replay 和只读视图，再切认识边界和 renderer，最后才引入第一个 Free projection。

它没有试图一次实现完整 GWA，也没有把陪审团当成形式不变量；最关键的提交前固定、查询路径不改变事实、主体知识不等于世界真值和呈现只读批准数据均有可测试接口。

因此审查结论为：**允许进入 Phase 1；暂不允许直接实现 fiber_mark/Stable Realizer（Phase 3），直到 Phase 1、2 门禁分别通过。**
