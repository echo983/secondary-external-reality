# 证言：多主体 Agent Epistemic Graph 最小闭环 设计 v1.0

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 早就点名、一直没做的第四个代表性纵切面（"从证言得知信息"），以及 `docs/VISION-first-experience-instance-v1.0.md` §4 第 1、2 项。

## 1. 目标

`self` 目前是这个 MVP 唯一的认识主体。要撑起愿景文档里"被目击、被告密"这类体验，第一步不是把镇子建起来，是先在现在的 3 房间世界里证明：**第二个主体能不能拥有自己独立的证据/认识状态，并且能把这份认识转述给 self**。

## 2. 一个意外发现：内核骨架比想象中更现成

调查代码后发现，`AgentEpistemicGraphView`/`buildAgentEpistemicGraph`（`src/epistemic/agentGraph.ts`）从来就不是 self 专属的——`evidenceFor(agentId, ...)` 本来就接受任意 `agentId`；`replayCanonicalViews`（`src/replay/canonicalReplay.ts`）里 `knownAgentIds` 是从 `world.entities` 里过滤 `entityType === "person"` 动态算出来的，不是写死 `["self"]`。也就是说，**只要往 fixture 里加一个新的 `person` 实体，它就自动成为一个合法的认识主体**，这部分完全不用改。

真正需要注意的是 `legacyCanonicalAdapter.ts`（`adaptLegacyCommits`）里一个不算 bug、但容易踩到的细节：一条 evidence 的 `observerId` 优先取 `sourceEvent.subjectRef`，只有 `subjectRef` 缺失时才回退到 `epistemicChanges` 里记录的 `agentId`。如果证人的证据复用 self 那次 `write` 动作的同一个 event（`subjectRef: "self"`），`observerId` 会被错误地解成 "self"——虽然 `EpistemicAcquisition.agentId`（真正决定 `evidenceFor` 查得到查不到的字段）仍然会正确来自 `epistemicChanges`，不影响功能，但这是一笔语义上说不通的账。解决方式很直接：**证人的证据用证人自己的事件**（`subjectRef` 就是证人的 entityId），不复用 self 的动作事件，从根上避免这笔糊涂账,不需要改 `legacyCanonicalAdapter.ts`。

## 3. 最小场景：室友、写字、证言

新增一个 `person` 实体 `roommate-1`（别名"室友"/"roommate"），固定锚定在 `position: "bedside"`——**这次不给 NPC 任何自主行动/移动能力**，纯静态。之所以选这个位置：`write`（在纸条上写字）只能在卧室里发生（纸条、笔都锚定卧室家具），室友固定在卧室，意味着**这次室友对"写字"这一件事，天然、总是在场**——这是刻意的简化，不是巧合。

**目击机制**（只加在 `write`/`write_and_hide` 分支，不做成通用框架）：室友和 self 同房间时（`roomForPosition` 比较，和物理够得着那次用的是同一个判定单位），额外生成一条**独立于 self 那次写字事件**的证人事件（`subjectRef: "roommate-1"`），配一条新的 `attribute_observed` 证据（纸条的 inscription 值）和一条 `epistemicChanges` 记录（`agentId: "roommate-1"`）。这条证据完全不影响 self 自己的证据状态——self 写完字之后，除非自己另外去读一遍，依然像现在这样"不自动知道自己写了什么"（这是既有行为，本次不改）。

**新操作 `consult_testimony`**（"问室友纸条上写的是什么"）：这次刻意范围很窄，硬编码成"问室友、问纸条内容"这一件事，不做成"问任意人任意事"的通用对话框架（和 `recall_inscription` 只认纸条一个道理，都是先证明机制，不急着泛化）。

- 先检查 self 和室友是否同房间（复用"物理够得着"那次的房间比较），不在场——`boundary`，复用 `TARGET_NOT_PERCEIVABLE`；
- 读室友自己的认识状态（`epistemic.evidenceFor("roommate-1", entityAttributeAddress("blank-note-1","inscription"))`），室友没有——`boundary`，新增 `TESTIMONY_UNAVAILABLE`（"室友似乎不知道这件事。"）；
- 室友有——生成一个新的 `consult_testimony` 事件（`subjectRef: "self"`）、一条新的 `attribute_observed` 证据（值取室友已知的值，不重新验证）、一条 `epistemicChanges`（`agentId: "self"`）。**不产生任何 WorldCommitment**——问一句话不会改写世界，只会让 self 多知道一件事。**每次问都是一次新的、真实的证据事件，不做成 `consult_acquired_evidence` 那种"读一次记一次"的零提交早返回**——这和 `look_around`/`observe` 重复查询"每次都是一次真实观察事件，都记一笔"的既有惯例一致，证言在这一点上更接近"观察"而不是"回忆"。

## 4. 明确排除

- **不做 `mode: "testimony"` 这类认识获取方式的正式区分**。`EpistemicAcquisition.mode` 目前只有 `"direct_perception"` 一个值，`adaptLegacyCommits` 的非 canonical 回退路径把它写死成这一个值，牵一发动全身。这次不去改——证言不直接授权 WorldTruth（P7）这条纪律，靠"`consult_testimony` 不产生任何 WorldCommitment"这个结构性事实就已经满足，不需要再叠一层 mode 标记才算数。真要做错误证言/说谎这类需要区分"这是听来的还是亲眼看的"的功能时，再回来加这个字段。
- **不做 NPC 自主行动/移动**——室友永远待在卧室，不会自己走动、不会自己触发任何事情。
- **不做证言的衰减/遗忘**——室友一旦知道，永久记得，不套用 `recall_inscription` 那套窗口衰减机制（那是 self 自己回忆机制的专属特性，这次不推广）。
- **不做说谎/错误证言**——室友转述的永远是真值，这次只验证"转述"这条通路本身，不验证"转述可能不准"这件更复杂的事。
- **不做通用"问任意人任意事"框架**——`consult_testimony` 这次只认"问室友、问纸条"这一个具体实例。

## 5. 测试计划

- 本地单元测试：写字后（不自己读）直接问室友——拿到正确证言，零 WorldCommitment；从没写过字时问室友——`TESTIMONY_UNAVAILABLE`；写字+自己读过之后，跨过 `RECALL_FIDELITY_WINDOW` 让自己的回忆褪色（复用既有机制），此时问室友依然能拿到正确值——证明证言不受 self 自己记忆衰减影响；走到别的房间问室友——`TARGET_NOT_PERCEIVABLE`；
- Query Confluence：self 亲自读到的值和向室友问到的值必须一致（两条独立认识路径指向同一个已固定事实）；
- `CLOSURE_TEMPLATES` 新增 `"witness,write"`、`"place,witness,write"`（形状和现有 `"write"`/`"place,write"` 完全相同，只是这次 actionKind 集合多了"witness"）、`"consult_testimony": exactlyEmpty()`；
- 真实模型 live eval：新建 `runTestimonySequenceLiveEval.ts`，走一遍"写字→(不读)→跨房间走几步让记忆褪色的同款位移→问室友→拿到正确值"的真实路径。

## 6. 完成标准

1. 室友是一个真正独立的认识主体，拥有自己的证据/认识状态，机制上不是 self 的分身；
2. 证言这条认识路径和证据/观察路径（已有）、回忆路径（已有）三条并存，互不干扰，尤其是自己遗忘之后证言依然可靠这一点要验证到；
3. 证言不产生任何 WorldCommitment，不直接授权 WorldTruth；
4. 现有全部测试和真实模型 gate 保持通过。
