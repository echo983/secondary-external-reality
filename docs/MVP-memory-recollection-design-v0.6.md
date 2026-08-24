# 记忆：纸条内容的 trace/recollection 最小闭环 设计 v0.6

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 第 4 项（`docs/GWA-larger-architecture-study-after-v0.9.md` §"B. 紧随其后的开放世界能力"）

## 1. 目标

PlaceGraph 两次验证了"Free 投影 + 确定性 ΠS"这条纪律，但整个 MVP 目前只有一条认识路径：**感知/证据链**——`observe`/`look_around`/`inspect_contents`/`locate`/`inspect_inscription_value` 等操作，通过 `queryTriage.ts` 的 `triageFixedQuery` 判断目标现在能不能直接感知；不能的话，退到 `consult_acquired_evidence`：只要 `self` 曾经对这个 `SemanticAddress` 拿到过证据（`epistemic.evidenceFor` 里有记录），就**精确、永久、无衰减地**把最近一条证据的值原样吐出来，不管过了多少回合。

这不是 GWA 意义上的记忆，是"证据档案柜"——`EpistemicEdge`/`CanonicalEvidenceRecord` 本来就该是这样（证据不可篡改、可无限次原样调阅，这本身是对的，不应该改）。但架构研究文档明确要求把"记忆"单独建成一条链（`Event → encoding → MemoryTrace → retrieval(t) → Recollection(t)`），而不是让"记不记得"和"证据里有没有记录"变成同一件事——现实中"你看过一次的东西，此后无论多久后被问起都能一字不差地复述"本身就是要被质疑的建模缺口。

这次的范围**不是**给所有既有查询加衰减（那会改变 `hallway-sequence`/`living-room-sequence`/`query-confluence` 三个已经通过、且明确验证过"很久之后重新问也能拿到同一个证据值"的既有行为，属于不该碰的回归风险）。而是新增一条**平行的、显式的**认识路径——"回忆"——只作用于一个新选定的目标（纸条内容），证据链本身保持完全不变。

## 2. 目标事实的选择：为什么是纸条

`blank-note-1.inscription` 是这个 MVP 里唯一"由玩家自己书写、此后可能离开房间、此后可能被问起"的事实，天然适合承载"回忆"语义：

- 内容由玩家自己通过 `write`/`write_and_hide` 写下（不是 LazyRealizer 解析出来的 Free 投影，本次不涉及走廊/客厅那套机制）；
- `nightstand-1`/`drawer-1`/`table-1` 都是 `ROOM_SCOPED_ENTITIES` 里绑定 `bedroom` 的实体（见 `perceptionPolicy.ts`），纸条一旦不随身携带，走到走廊/客厅之后就不可感知——玩家有真实动机问"我记得纸条上写的是什么"而不是回头重新看一眼；
- 已经有完整的 `write`→`read`/`inspect_inscription_value`→证据（`entity:blank-note-1.inscription` 的 `attribute_observed` 证据 + `acquired_evidence` 认识变化）链路，不需要新建证据生成机制，只需要在"回忆"这条新路径上消费已有的 `EpistemicEdge`。

## 3. 新操作：`recall_inscription`

`OBJECT_OPERATION_KINDS`（`src/world/objectIntent.ts`）新增 `"recall_inscription"`，触发短语与既有 `inspect_inscription_value` 明确区分开（"现在写着什么" vs "我还记不记得"）：

```text
中文：我还记得纸条上写的是什么吗 / 我记得纸条上写了什么 / 纸条上写的我还记得吗
英文：do I remember what the note said / do I still recall what was written on the note
```

`inspect_inscription_value` 保留原样（"纸条上写着什么"仍然是"现在去看"，走原有的证据/感知路径）；只有明确带"记得/回忆/remember/recall"语义的才路由到新操作。

`recall_inscription` **不经过 `triageFixedQuery`**——它不关心纸条现在能不能被感知（这正是"回忆"和"观察/证据调阅"的本质区别：问的是主体自己脑子里还剩什么，不是世界现在是什么状态，也不是证据档案柜里存了什么）。它直接读已重放好的 `AgentEpistemicGraphView`：

```ts
const edges = epistemic.evidenceFor("self", entityAttributeAddress("blank-note-1", "inscription"));
const latest = edges.sort((a, b) => b.acquiredAtCommitSequence - a.acquiredAtCommitSequence)[0];
```

三种结果：

1. **从未获得过证据**（`latest` 不存在）：新的 boundary，复用既有 `NO_ACQUIRED_EVIDENCE` 语义（"你从来没看过纸条上写的字"/"You've never read the note")——这不是遗忘，是压根没有过这段记忆，用词要能区分。
2. **在保真窗口内**（`options.commitSequence - latest.acquiredAtCommitSequence <= RECALL_FIDELITY_WINDOW`）：原样返回 `latest.representedValue`，措辞明确标成"回忆"而不是"看到"（"你回忆起纸条上写着"X"" / "You recall the note said "X""）。
3. **超出保真窗口**：新的 boundary code `RECOLLECTION_FADED`（"你记不清纸条上写的是什么了"/"You can't recall what the note said anymore"）。

`RECALL_FIDELITY_WINDOW`：一个提交层面的整数常量（初定 **4**——4 次真正改变世界的提交之后就会"记不清"，刻意选得小，方便在真实模型 live eval 里用几步 `move`/`open`/`close` 就能跨过窗口，不代表真实遗忘曲线，只用来证明衰减机制本身存在且确定性可重放）。

**时间单位的选择**：不用真实时钟，也不用"总回合数"，而是复用已有的 `acquiredAtCommitSequence` vs 当前 `commitSequence` 之差——两者都已经是提交序号，且已经在 `EpistemicEdge`/`consult_acquired_evidence` 里被证明是确定性、可重放的。这也意味着：纯查询式的回合（比如连续问两次"我在哪"）不推进这个距离，只有真正写入 WorldTruth 的回合（`move`/`open`/`close`/`write`/`take`/`place` 等）才计数——"记忆随世界实际发生的事情老化，不随你问了多少个无关问题老化"，是刻意的建模选择，不是简化的副作用。

## 4. 不改写 WorldTruth，不新增证据

`recall_inscription` **不产生新的 `EvidenceRecord`，不产生新的 `WorldCommitment`，不产生新的 `epistemicChanges`**——回忆本身不是一次新的感知，不能反过来让"记忆"变成"新证据"（那会让遗忘之后又能靠"回忆"重新刷出一条同样精确的证据，等于遗忘从未发生）。`CLOSURE_TEMPLATES["recall_inscription"] = exactlyEmpty()`，closure 形状和 `inspect_inscription_value`/`inspect_inscription_presence` 一致：零提交。

即：`recall_inscription` 和现有 `consult_acquired_evidence`/boundary 分支一样，走"不推进 store"的早返回路径（在 `registry`/`commitments`/`events` 等可变数组声明之前就返回），不占用新的 `commitSequence`。

**验证遗忘不等于篡改过去**：窗口过后拿到 `RECOLLECTION_FADED`，不代表纸条真的被擦除或证据被删除。同一局里如果玩家实际走回去用 `inspect_inscription_value`/`read` 直接再看一眼纸条（只要纸条还可感知），应该拿到和最初一模一样的真实值——这是本次验收的核心断言：**遗忘只发生在"回忆"这条新路径上，"证据/感知"那条老路径完全不受影响，两条路径对同一个 `SemanticAddress` 在同一时刻可以合法给出不同答案**（一个说"记不清了"，一个说出精确值），这不违反 Query Confluence（V1 管的是"同一条认识路径、不同问法/顺序必须得到同一个已揭示的值"，不要求"任意两条不同性质的认识路径必须给出同一等级的确定性"）。

## 5. 明确排除

- 不做错误回忆（回忆出一个错的、和真实值不同的数字）——架构研究文档原话"近期不必模拟复杂心理学"，本次只做"精确 / 记不清"两级，不做"记错"第三级；
- 不做记忆强化/多次阅读延长窗口——`latest`（最近一次证据）已经是"每次重新阅读会刷新回忆基准点"的最简单实现，不再单独建强化模型；
- 不给走廊/客厅的 `notable_feature` 或任何既有查询路径加衰减——那些路径已被验证过的"很久之后依然能精确调阅"行为保持不变；
- 不新建 `MemoryTrace` 作为独立实体/关系类型持久化到 world commit——本次的"trace"完全是从既有 `EpistemicEdge`（`acquiredAtCommitSequence`）派生计算出来的，不额外扩展存储 schema；如果以后需要多个独立衰减目标或强化机制，再考虑要不要物化成真正的实体；
- 不做"忘记后能否重新问出边界之外的新调查路径"（架构研究文档提到的"线索或新的调查路径"）——本次只做最小闭环（精确回忆 / 从未知道 / 记不清），不做线索生成。

## 6. 测试计划

- 本地单元测试（`test/object-turn.test.ts`）：
  1. 写下纸条 → 立刻 `recall_inscription` → 精确命中（等价于窗口内）；
  2. 从未写过/从未读过纸条 → `recall_inscription` → `NO_ACQUIRED_EVIDENCE`；
  3. 写下并读取纸条 → 跨过 `RECALL_FIDELITY_WINDOW` 次真实提交（用 `move`/`open`/`close` 填充）→ `recall_inscription` → `RECOLLECTION_FADED`；
  4. 紧接上一步，直接 `inspect_inscription_value`（不是回忆，是真正再看一眼）→ 依然拿到原始精确值，证明 WorldTruth/证据未被回忆路径污染；
  5. `recall_inscription` 本身零提交（`CLOSURE_TEMPLATES` 校验 + `commitSequence` 在回忆前后不变）。
- `checkCommitmentClosureTemplates` 新增 `recall_inscription: exactlyEmpty()` 条目；
- 真实模型 live eval（新建 `runMemoryRecollectionSequenceLiveEval.ts`，同一套模式接入 `runMvpLiveGate.ts`）：`打开门写下数字` → 读一遍确认证据生成 → 立刻回忆（应精确）→ 走出房间再走回来几次填充提交跨过窗口 → 回忆（应记不清）→ 直接再读一遍纸条（应仍精确，证明底层事实未被破坏）；
- 全量回归：`npm test` + `npm run eval:mvp-gate:live`，确认不破坏已有 171/171（尤其是 `query-confluence`/`hallway-sequence`/`living-room-sequence` 三个依赖"证据长期可精确调阅"的既有断言）。

## 7. 完成标准

1. `recall_inscription` 是和感知/证据调阅完全独立的第三条认识路径，不改动 `triageFixedQuery`/`consult_acquired_evidence` 既有行为；
2. 保真窗口内精确回忆、窗口外确定性地"记不清"，两者都是 `commitSequence` 距离的纯函数，可重放、不依赖真实时钟；
3. 遗忘不改写、不删除、不污染 WorldTruth 或既有证据——窗口过后直接重新感知依然拿到真实值；
4. 新增操作 closure 形状为零提交，不产生虚假的"回忆=新证据"闭环；
5. 现有 171/171（尤其三个依赖长期精确证据调阅的既有 suite）保持通过，证明新增的"回忆会衰减"路径和既有的"证据不衰减"路径互不干扰，是两条正交机制,不是同一件事的两种实现。
