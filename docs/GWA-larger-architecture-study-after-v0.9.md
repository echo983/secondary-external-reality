# GWA 原文复读后的大结构研究（v0.9 之后）

日期：2026-08-23  
性质：架构研究，不是实施计划；本文件不扩大当前 MVP 的能力承诺。

## 阅读范围与规范优先级

本轮对照阅读：

1. `GWA-v0.3a-dual-layer.txt`；
2. `GWA-v0.3a-P1-P6c-FROZEN-total-patch.txt`（冲突处优先于 v0.3a）；
3. `GWA-Core-v0.3b-CMWF-1-formal-consensus.md.docx`；
4. `GWA-countersignature-patch-v0.3b-CMWF1.docx`；
5. 项目已有的 v0.6 世界基础审计与加固记录。

v0.3b/CMWF-1 把呈现边界进一步说清：World Kernel 决定什么是真的，Presentation 决定呈现了什么，Observation 决定什么成为证据。渲染结果本身不能反向构成 WorldTruth。会签补丁又补充了已暴露呈现的一致性和持久、可辨识呈现代用品的升级责任。

## 总判断

当前最需要的不是横向增加更多动作原语，而是纵向建立一层真正的“承诺—认识—呈现”骨架。

v0.9 已经证明“开放表达，封闭因果原语”可行，也已有追加提交、确定性重放、实体关系、证据记录和受控呈现。继续增加原语当然能改善短期可玩性，但无法解决以下结构问题：主体知道什么、某个过去事实何时被固定、为什么两个问法必须得到同一个世界、一次看见是否应成为永久事件、LLM 能看见哪些内部信息，以及以后怎样生成此前未写死但又不能迎合当前问题的事实。

因此建议把下一次“大版本”理解为 **Canonical Commitment & Epistemic Kernel（规范承诺与认识内核）**。它不是完整实现 GWA，而是选择少数能长期承重的接口先定型。动作原语仍可增加，但应成为这层内核的消费者，而不是主架构。

## 建议的大设计

### 1. 规范投影与承诺图

把当前“字段和值”提升为具有稳定 `SemanticAddress` 的投影，并显式记录：

- determination：`Free` 或 `CounterfactuallyFixed`；
- exposure：`Unexposed`、`StructurallyReferenced`、`ExperientiallyExposed`；
- root provenance：seed/μ、struct、exp，可同时存在；
- dependency footprint：该投影成立所依赖的实体、事件、关系和其他投影；
- schema/operator/version：支持确定性重放和以后升级审计。

这两组状态必须正交。一个事实可以已经固定但尚未被人看到；暴露不会重新选值，只增加 exp-root 和 Historical Load。对象不能整体标成“已知/未知”，固定粒度应是投影。

当前 `ProjectionState = known | unknown | unsupported` 可继续作为 MVP 表面协议，但不宜直接扩张为长期承诺模型。GWA 的规范模态更接近：Unsupported/Absent、Supported+Free、Supported+Fixed。

### 2. Query Triage 成为中央内核服务

开放世界的核心不是万能 Action IR，而是统一的 Query Triage：

```text
输入/动作产生语义目标
→ 规范化为稳定 SemanticAddress
→ 判断是在读取 Fixed，还是首次解析 Free
→ 寻找观察者可用的 EpistemicPathSet
→ 枚举 Zoom / Redirect / Boundary / EntailedRefusal / ResolvedRefusal
→ 估算 Commitment Footprint 与允许的 Resolution Horizon
→ 仅解析 MSRC
→ 一致性检查并原子提交
→ 生成批准的证据/动作/认识包
→ 呈现
```

这也回答 Action IR 是否可以更开放：LLM 可以开放地提出语义目标和候选路径，但不能决定潜在事实的值、承诺闭包或退出方式。陪审团是有用的语义审计，不是 I1/I3/I4/I6/I7 的替代品。

### 3. WorldTruth、Evidence、Agent Epistemic Graph 三分

目前查询大多直接从 `MaterializedWorld` 得出响应，并附带 evidence/epistemic change；这在小房间里成立，但进入开放世界会逐渐等同于“玩家拥有全知数据库接口”。

长期结构应区分：

- WorldTruth：世界实际承诺；
- Evidence：某观察/痕迹/说法产生的不可变记录；
- Agent Epistemic Graph：主体通过直接感知、证言、记忆或推理能够相信什么；
- Explanation Model：用于解释证据如何产生，可替换，但不能改写事实或证据；
- Presentation：只读取本回合批准的玩家可见包。

以后“纸条上是什么”不只是读取 inscription：还要判断纸条是否可见、文字是否处于观察带宽内、主体是否本回合直接读取，或只是在回忆/转述。正确回答可以是事实、边界、线索或新的调查路径。

### 4. 记忆是一条事件链，不是实体字段

若系统要支撑长时间行动，“纸条还能找出并看到数字”和“我还记得数字”是两个问题。建议保留 GWA 的链：

```text
Event → encoding → MemoryTrace → retrieval(t) → Recollection(t)
```

错误回忆本身是不可撤销的认识事件，不能覆盖真实过去；遗忘只增加 Epistemic Slack，不能重新开放已固定的 WorldTruth。近期不必模拟复杂心理学，但数据边界应避免把 `agent.knows = boolean` 或可漂移的 `memory.value` 写死为长期接口。

### 5. 语义因果边界

明确区分：

- Procedural Ephemeral Value：动画抖动、寻路临时值、采样中间量，可以丢弃；
- world-semantic value：可被问“当时是真的吗”、构成持久状态转换的原因、进入证据/记忆/事件者，必须先获得 SemanticAddress 并 resolve-and-commit。

工程上应由类型和接口阻止临时值未经“语义化”就成为永久因果依赖，而不是要求所有计算进入账本。关键判据不是“玩家是否看见了数值”，而是它是否承担了世界语义因果角色。

### 6. 最小充分解析闭包（MSRC）

当前按 commitment/event/state-change 数量计费是好用的 MVP 近似，但不是 GWA 的 Minimal Commitment。回答“Peter 送了项链”不能只写 `giver_name=Peter`；它至少要求稳定实体、赠与事件、参与关系与物品来源，反之就形成悬空事实。

建议未来让每类规范事实声明 closure rule，并由内核计算最小充分闭包。第一版不需要通用逻辑求解器，可以从封闭 schema 的依赖模板开始。验收重点是：提交的语义后果不得依赖仍为 Free 的世界语义投影。

### 7. 内涵式承诺与可重放生成器

开放世界不可能全部物化。可把一些事实以版本化规则、参数、域和 seed 的“内涵式承诺”保存，而不是展开成海量行；但它在语义上仍承诺整个适用域，不能把存储便宜误认为承诺便宜。

任何声称可重放的生成，都应满足二者之一：

- 确定性、版本化生成器 + 已提交 seed/参数/域；
- 将随机结果本身物化为承诺。

查询目的、叙事便利和玩家愿望不能反向参与过去事实的选择。它们可以影响未来因果分布和“在哪里揭示”，不能影响“过去是什么”。

### 8. 呈现合同与已暴露一致性

renderer 只读批准的 player-facing packet，禁止读取解释、内部评分、被拒候选、叙事效用和未提交潜变量。现有 prompt 纪律应最终升级为数据结构上的信息流边界。

此外需要记录足以约束未来呈现的 exposure provenance。若呈现反复给出稳定且可辨识的替代物（独特伤疤、固定房门颜色、同一张脸），系统必须二选一：把相关模态提升为规范世界投影，或明确标为不可用于世界内识别的 presentation-only placeholder。不能让缓存偶然承担身份真相。

### 9. Subject / EpistemicAgent 采用能力建模

`self` 首先是 Entity；能观察、形成证据路径和记忆时，具有 EpistemicAgent 能力。身体行动能力、感官、语言和社会行为也应通过能力/规则组合，而不是把“人类常识”散落进动作实现。这会使动物、摄像头、失去意识的主体或有限传感器自然落入同一结构。

### 10. 结构化验证替代“LLM 多数票”

应逐步加入几类性质测试：

- Query Confluence：对纯揭示问题随机改变措辞和顺序，已揭示子图同构；
- Projective Consistency：细分辨率投影回投时严格等于已有粗粒度承诺；
- Commitment Closure Integrity：永久语义后果的依赖均已进入闭包；
- Minimal Resolution：新增承诺接近该操作的 MSRC，不无关预生成；
- Replay/Presentation Consistency：同一世界 basis 与观察条件不产生身份级矛盾。

LLM 工位适合判断自然语言忠实度、经验可信性和解释质量；确定性检查负责权威边界。

## 与现状的对应

已经可靠的基础：

- 追加式 `world_commits`、basis/hash、重放和提交前试应用；
- 实体、属性、关系、引用完整性和单写者边界；
- LLM 不持有 append 权；
- 开放语义 IR 经审计后编译到封闭能力；
- evidence 与 epistemic change 已有最小结构；
- renderer 以 commit package 为输入，不直接生成 WorldTruth。

主要结构缺口：

- 尚无独立、可重放的 Agent Epistemic Graph；
- `observations: unknown[]` 不是稳定观察协议；
- 许多查询仍直接读取全局物化世界；
- Free/Fixed、root、closure、Load 没有成为一等数据；
- 观察 occurrence、认识 acquisition 与 PersistentWorldEvent 的边界仍较粗；
- 尚无通用 MSRC、QueryPathInvariance 和 CausalSelectionBarrier 验收；
- seed fixture 预先固定了小世界的大部分内容，尚未真正拥有 Free Slack；
- presentation exposure 尚未形成可审计的承诺来源；
- 过程/规则尚无正式的版本化内涵承诺。

## 建议的先后层次（非排期）

### A. 近期必须定型的骨架

1. SemanticAddress 与投影级状态/来源；
2. typed Observation、Evidence、EpistemicAcquisition；
3. 最小 Agent Epistemic Graph；
4. Query Triage 的固定读取/自由解析/认识边界三路；
5. renderer 的批准数据包和 exposure provenance；
6. confluence、closure integrity、replay 测试。

这组完成后，再增加移动、空间、感知和更多动作原语，收益会明显更稳。

### B. 紧随其后的开放世界能力

1. 少量 Supported+Free 投影与稳定 LazyRealizer；
2. schema 驱动的 MSRC 模板；
3. PlaceGraph、观察带宽与主体能力；
4. 记忆 trace/recollection 的最小闭环；
5. 规则/过程的版本化内涵承诺。

### C. 应继续延后的庞大系统

- 通用 Explanation Refactoring 和 Anomaly Debt 求解；
- 高保真社会关系与完整 illocution registry；
- 动态宏观历史、城市生成、经济生态；
- RE2 motif、几何与关卡证明系统；
- 通用戏剧结构接受函数；
- 大规模语义压缩、冷却和释放策略。

这些方向与 GWA 相容，但不是当前开放自然语言输入的前置条件。

## 近期决策建议

从结构上，建议采用约 **70% 内核骨架、30% 原语补齐** 的投入方向。原语只补足验证骨架所需的代表性纵切面，例如移动到相邻地点、观察受遮挡对象、从证言得知信息、隔一段时间回忆纸条；不追求动作数量。

下一个里程碑可以围绕一句可验证目标定义：

> 同一个未预写死的世界投影，在不同自然语言、查询顺序和认识路径下，只被规范地解析一次；主体只能从合法证据路径得知它；以后仍可重放、回忆或发现自己记错，而世界过去不被改写。

若这句话成立，系统才真正开始从“小房间动作程序”过渡到“可持续展开的第二外部现实”。
