# 阶段2 · 对外契约 v1.0

日期：2026-08-24
依据：`docs/STAGE2-BOUNDARY-DEFINITION-v1.0.md` 第1项，四步实现顺序第4步（收尾）。前三步（`present_at`、schema 注册表、`adjacent_to`）落定后，这份文档把当前形状正式固定下来。

## 1. 这份文档是什么

**给谁看**：未来的内容加载器、阶段3的引擎能力、任何"消费"这个内核而不是"实现"这个内核的代码。它们可以放心依赖这份文档列出的形状不会被无预警重命名或删除。

**不是什么**：不是内部实现细节的承诺（`MaterializedWorld` 的私有字段、`objectTurn.ts` 内部的中间数据结构、jury/candidate 相关的内部决策类型都不在契约范围内，可以自由重构）。也不是自动跟源码同步的镜像——具体字段定义以源码为准（本文档标注了每一块对应的文件路径），这份文档记录的是**稳定性承诺和治理规则**。

## 2. 版本号规则：只加不改不删

- **已发布的字段/类型/谓词/实体类型/枚举值，语义和名字不会被重命名或删除**，只会新增。
- **新增实体类型**：通过 `worldSchema.ts` 的 `registerEntityType(entityType, attributes)` 运行时注册，不需要改这份契约文档，也不算破坏契约——这是这份契约特意留的扩展口子（`docs/STAGE2-schema-registry-design-v1.0.md`）。
- **新增关系谓词/`PublicBoundaryCode` 枚举值/`WorldCommitment` 的 kind/属性的取值校验规则**：目前都还是编译期字面量，加一个新的需要改内核源码——这算契约的**加法性变更**（不破坏现有消费方），但需要走代码修改+版本号递增流程，不像实体类型那样有运行时注册口子。是否也要把它们做成运行时可扩展，是这份契约之外的、真正需要时再决定的问题（比如"新加一种关系谓词"目前只有 `present_at`/`adjacent_to` 两次真实先例，都是直接改代码，还没有形成非要做成注册表不可的证据）。
- **契约版本号本身**：这份文档顶部的 `v1.0` 就是契约版本号，是文档级的，不是运行时字段——不新增运行时"契约版本"标记（避免装饰性字段，参考 `docs/MVP-intensional-commitment-fidelity-design-v0.9.md` 对"不加没人读的 generatorVersion 字段"的同一判断）。契约发生破坏性变更时，发布新的 `docs/STAGE2-external-contract-v2.0.md`，并在其中写清楚跟 v1.0 相比改了什么。

## 3. 契约内容

### 3.1 实体类型与属性（`src/world/worldSchema.ts`）

内置类型（截至本文档写作时）：`person`、`bed`、`pillow`、`nightstand`、`drawer`、`table`、`key`、`paper_note`、`pen`、`door`、`container`、`place`——每个类型允许的属性名见源码 `attributesByType`。

扩展方式：`registerEntityType(entityType, attributes)`。只声明"这个类型允许哪些属性名"；属性的取值校验规则（`open_state` 只能是 open/closed、`posture`/`position`/`notable_feature` 的枚举、`inscription` 的数字正则、布尔属性只能是 "true"/"false" 字符串）继续由内核按属性名统一校验，与实体类型无关，新类型无法自定义这些规则。

### 3.2 关系谓词（`src/world/worldSchema.ts` 的 `predicates`）

`located_on`（宾语须是 surface 或 bed）、`contained_by`（宾语须是 container 或 pillow，防环）、`held_by`（主语须 portable、宾语须是 person）、`part_of`（结构性组成，无额外限制）、`present_at`（宾语须是 place，主语在同一时刻只能 present_at 一个地点）、`adjacent_to`（两端都须是 place，不能自反，对称性是约定不是强制）。

### 3.3 `WorldCommitment`（`src/protocol/types.ts`）

五种 kind：`entity_created`（entityId + entityType）、`attribute_set`（entityId + attribute + value）、`relation_set`（subjectId + predicate + objectId，legacy 形式，无独立 relationId）、`relation_asserted`（同上 + 显式 relationId）、`relation_ended`（relationId）。这是内容加载器（无论是 `MaterializedWorld.replay()` 的种子承诺，还是回放的历史提交）唯一需要生成的形状。

### 3.4 `WorldBasis`（`src/protocol/types.ts`）

`{ fixtureId, fixtureVersion, seedHash }`——标识"这批种子承诺是哪个版本的世界"，用于拒绝跨版本回放（见 `test/object-turn.test.ts` 的"rejects replay under a different world-basis version"）。这是 fixture 粒度的版本号，跟本文档的契约版本号是两个不同的概念，不要混用。

### 3.5 Query Triage 决策协议（`src/query/types.ts`）

`FixedQueryKind`（`look_around`/`inventory`/`inspect_contents`/`locate`/`inspect_attribute`/`inspect_relation`/`consult_acquired_evidence`）→ `QueryRequest` → `QueryDecision`（`perceive_fixed_now`/`consult_acquired_evidence`/`epistemic_boundary`/`unsupported_boundary`/`resolution_deferred` 五选一）→ `QueryOutcome`（`approved_answer`/`approved_boundary`）。这条协议保证认识路径只能走这五种合法出口之一，是 P7（语言从不直接授权 WorldTruth）在查询侧的具体体现。

### 3.6 呈现包契约（`src/presentation/types.ts`）

`PublicBoundaryCode`（当前9个值：`TARGET_NOT_PERCEIVABLE`/`CONTAINER_CLOSED`/`NO_ACQUIRED_EVIDENCE`/`UNSUPPORTED_PROJECTION`/`RESOLUTION_DEFERRED`/`AMBIGUOUS_TARGET`/`RECOLLECTION_FADED`/`OUT_OF_OBSERVATION_BANDWIDTH`/`TESTIMONY_UNAVAILABLE`）、`ApprovedPresentationItem`（`observed_entities`/`bounded_relation_set`/`attribute_evidence`/`relation_evidence`/`prior_evidence`/`recollection`/`boundary` 七种 kind）、`ApprovedPresentationPacket`（`packetId`+`outcome`+`language`+`items`）。呈现层（`renderer.ts`）只能从这个批准过的数据包里取词造句，不能访问未经批准的原始事实——这是内核对外呈现的唯一合法通道。

## 4. 这次探针/前三步分别用到并验证过契约的哪些部分

- `docs/PROBE-stage2-pack-loader-v1.0.md`：验证过 3.3（`WorldCommitment` 的 `entity_created`/`attribute_set`/`relation_asserted`）足够表达外部内容，也是发现 3.2 缺 `present_at` 的地方。
- 本次三步分别落实了 3.1（注册表）、3.2 的 `present_at`/`adjacent_to` 两个新谓词。
- 3.4/3.5/3.6 这次没有改动，原样确认为契约的一部分（历史上已经被 Layer A/B/C 的验收测试反复验证过，见 `docs/GWA-larger-architecture-study-after-v0.9.md`/`docs/STATUS-four-stage-maturity-assessment-v1.0.md`）。
