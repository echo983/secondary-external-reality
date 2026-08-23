# 门外/走廊 PlaceGraph：设计 v0.4

日期：2026-08-24
状态：设计（实现前，含一个待用户拍板的关键分叉）
对应：路线图 Layer B 第 1、3 项（少量 Supported+Free 投影与稳定 LazyRealizer；PlaceGraph）

## 1. 目标

让"门外"第一次成为世界里真实存在、可以走进去的空间，而不是永远返回"未建模边界"。这是继床边↔门口之后，第一次跳出"复用已有实体当地标"的取巧方案——门外没有任何现成实体可以借用，必须真正决定：走廊是什么、它里面有什么、这些内容从哪来。

## 2. 关键分叉：走廊内容是预先写死，还是真正 Free？

这是本设计唯一需要用户在动手前拍板的问题，因为两条路径的实现量和验证目标完全不同。

### 选项 A：预先写死（像卧室一样）

走廊实体和它的全部内容在 `seedCommitments` 里一次性提交，和卧室的钥匙、纸条一样。

- 优点：实现量小，复用现有 fixture 模式，风险最低；
- 缺点：**没有真正测试到 Phase 1 成功线**。路线图文档结尾那句可验证目标——"同一个**未预写死**的世界投影，在不同措辞/顺序/认识路径下只被规范解析一次"——预写死的走廊不构成这个意义上的"未预写死投影"，只是又加了一个房间。GWA 研究文档的结构缺口清单也明确写着"seed fixture 预先固定了小世界的大部分内容，尚未真正拥有 Free Slack"，这正是选项 A 会继续保留的缺口。

### 选项 B：真正 Free，首次被操作可寻址时才解析并提交（推荐）

走廊的**存在与可达性**（有一条走廊、门开着能走进去）是预先承诺的——这不需要是 Free 的，"从卧室能走到走廊"是设计决定，不是待解析的世界事实。但走廊里**具体有什么**（比如：有没有值得一提的东西）在被真正查询之前保持 `Free`，第一次被查询时才通过一个确定性、可重放的 `LazyRealizer`（ΠS）解析出一个值并原子提交，此后永久固定（I6 CounterfactualStability）。

这是本项目第一次真正践行"世界持有大量 Free Slack，直到一个投影被首次可操作寻址，才由 ΠS 解析、检查、原子提交，然后才暴露"这条 GWA 核心操作纪律（GWA-v0.3a 第 6 节"闭合表述"）。此前所有内容（钥匙在哪、纸条写了什么）从第一个 commit 起就是 committed 的，从未真正处于 Free 状态。

**推荐选项 B**，原因：如果这次仍然选择预写死，Phase 1（证明 GWA 内核方法论本身站得住）就始终缺一个关键验证点，之后每加一个新空间都会重复延后同一个问题，永远验证不到"惰性解析"这条 GWA 的核心主张。选项 B 的实现量确实更大，但复杂度是可控的——不需要通用生成器，只需要一个封闭、确定性、可重放的小函数。

## 3. 选项 B 的具体设计

### 3.1 空间与可达性（预先承诺，不是 Free）

不新建通用 PlaceGraph 图结构（只有 3 个节点时，通用图是过度设计，和床边/门口那次同样的 I7 判断）。扩展现有机制：

- 新增一个 Place 实体 `hallway-1`（entityType: `"place"`），走廊本身作为一个真实实体存在，但**不预先提交任何描述性属性**；
- `self.position` 的合法值从 `["bedside", "doorway"]` 扩展为 `["bedside", "doorway", "hallway"]`；
- `move` 到 `hallway-1` 的前置条件比之前多一条：**`door-1.open_state` 必须是 `"open"`**——这是第一个真正依赖另一实体状态的移动前置条件，此前 `move` 只检查"是否已经在目标位置"。这也让"先开门再出去"第一次成为有意义的因果链，而不是摆设。
- `door-1` 追加别名"门外"/"outside"/"走廊"/"hallway"作为 `hallway-1` 的地标——不对，这里要小心：`门外`/`hallway` 应该指向 `hallway-1` 本身，不是 `door-1`。`door-1` 的别名不变；`hallway-1` 的别名设为 `["走廊", "门外", "hallway", "outside"]`。

### 3.2 Free 投影：走廊里"有没有值得一提的东西"

新增一个二元 Free 投影：`hallway-1.notable_feature`。语义：走廊里是否有一件值得一提的东西（比如"墙上挂着一幅画"），值域是一个封闭小枚举（不是自由文本，避免 LLM 现场编内容）：

```text
notable_feature ∈ { "none", "framed_photo", "umbrella_stand", "wall_lamp" }
```

**解析规则（ΠS/LazyRealizer）**：确定性、种子化，不经过任何 LLM。用世界的 `worldBasis.seedHash`（已经存在，卧室 fixture 已经在算）作为种子，加上 `hallway-1` 这个稳定的 SemanticAddress，跑一个确定性哈希 → 枚举下标。相同的世界种子永远解析出相同的值；不同的种子（比如未来换一次 fixture 版本）会解析出不同但依然确定的值。这满足 GWA 对"内涵式承诺"的要求："确定性、版本化生成器 + 已提交 seed/参数"。

**触发时机**：第一次有操作**操作性地寻址**这个投影——具体来说，是第一次玩家在 `hallway-1` 位置执行 `look_around` 或对走廊执行 `inspect_contents`/`observe`。在那之前，任何"预判"走廊里有什么的行为都是非法的（不能因为玩家提到走廊就提前解析，必须真正被查询）。解析发生时：

1. 检查 `hallway-1.notable_feature` 是否已经是 committed 状态（读取 `MaterializedWorld` 里是否存在这条 `attribute_set`）；
2. 如果还没有：用种子确定性计算出值，作为**这次操作提交的一部分**（`attribute_set(hallway-1, notable_feature, <value>)`），和这次查询的证据/认识变更原子一起提交——不是提前算好放在别处，是这次 commit 的一部分；
3. 如果已经有：直接读取已提交值，绝不重新计算（I6：一旦可寻址，永久稳定）。

### 3.3 一致性检查

这个设计必须满足 GWA 对"语义读取即产生依赖"的规则（v0.3a P1 补丁 §12 semantic_read_clause）：一个携带 SemanticAddress 的 Free 投影，一旦被语义读取，就必然变成 OperationallyAddressable 并立即原子提交，不存在"读取了但没提交"的中间态。实现上：解析和提交必须在**同一个 commit** 里完成，不能先读后写留缺口——这正是既有 `runObjectTurn` 尾部的 `commitCandidateEnvelope` 单一提交路径已经保证的东西，本设计不需要新的提交机制，只需要在 `look_around`/`inspect_contents` 处理走廊时，多一步"检查是否已解析，未解析则计算并加入 `commitments`"。

### 3.4 明确排除

- 不做走廊之外的第二层空间（走廊尽头是什么、走廊里的门通向哪——那是下一次扩展）；
- 不做走廊的多个 Free 投影，只做这一个（`notable_feature`），验证机制而不是堆内容；
- 不让 LLM 参与"走廊里有什么"的内容决定——LazyRealizer 是纯确定性代码，LLM 只负责把玩家的自然语言解析成"查询走廊内容"这个意图，和现有 Interaction IR 分工完全一致；
- 不改变 `look_around` 现有的呈现层限制（第 v0.3.0 milestone 里已经明确 descope 的"呈现随位置变化"问题，这次不重新捡起）。

## 4. 实现清单

- `src/world/worldSchema.ts`：`place` 实体类型（属性：`notable_feature`，值域见 3.2）；`self.position` 值域追加 `"hallway"`；
- `src/world/objectFixture.ts`：新增 `hallway-1` 实体（**不提交** `notable_feature`，只提交 entity_created），别名 `["走廊", "门外", "hallway", "outside"]`；追加 `hallway-1` 与 `door-1` 的某种"经由"关系？—— 不需要新谓词，`move` 的目的地映射表直接扩展；
- `src/turn/objectTurn.ts`：
  - `MOVE_DESTINATIONS` 扩展 `door-1 → "doorway"`（不变）+ 新增 `hallway-1 → "hallway"`；
  - `move` 分支新增前置条件：目的地是 `hallway-1` 时，`door-1.open_state` 必须是 `"open"`，否则报错"门还关着，你出不去。"/"The door is still closed; you can't go through.";
  - `look_around`/`inspect_contents` 分支：当前置于 `hallway-1`（或目标是 `hallway-1`）时，先检查 `notable_feature` 是否已提交，未提交则用种子确定性解析并加入本次 commitments；
- `src/verification/acceptanceChecks.ts`：`CLOSURE_TEMPLATES` 需要为"首次解析走廊"这个新形状（`look_around` 或 `inspect_contents` 单独出现，但这次带 1 条 `attribute_set(hallway-1, notable_feature, *)` commitment）新增一条模板分支——这正好是第一次出现"同一个 actionKind 组合，根据世界是否已解析过，允许两种合法闭包形状"的情况，需要在闭包模板里显式建模，不能简单归为违规；
- `src/interactionIr/compiler.ts`：无需改动（"走廊"/"门外" 现在能通过通用别名解析，`observe`/`look_around` 的角色绑定路径不变）。

## 5. 测试计划

- 本地测试：
  - 走廊/门口/床边三态 `move` 往返，门关着时禁止走进走廊；
  - 走廊内容首次查询解析并提交，二次查询读到相同值（同一 store 内幂等）；
  - 两个全新 store（相同 fixture 种子）各自首次解析走廊内容，必须解析出**相同**的值——这是验证 LazyRealizer 确定性的关键测试，且要接进 `checkQueryConfluence`：不同的"首次查询走廊"措辞/顺序必须解析出同一个 `notable_feature`；
  - `checkCommitmentClosureTemplates` 的新模板分支正反例；
- 真实模型 live eval：新增 `runHallwaySequenceLiveEval.ts`，覆盖"门关着走不出去→开门→走到走廊→环顾走廊→回卧室→再问一次走廊里有什么，答案不变"的完整状态化序列，双工位真实解释；
- 全量回归：`npm test` + `npm run eval:mvp-gate:live`，确认不破坏已有 153/153。

## 6. 完成标准

1. 门关着时无法走到走廊，开门后可以；
2. 走廊内容第一次被查询时才解析，此前任何操作都不能提前泄露它；
3. 同一世界种子下，不管查询措辞、顺序如何，走廊内容解析结果唯一且稳定（这是路线图 Phase 1 成功线第一次被完整验证，不再是"未预写死"的空话）；
4. 现有 153 条真实门禁用例保持通过；
5. 达标后，Phase 1 的核心可验证目标可以正式宣告成立，为转向 Phase 2（可体验文字世界）打下第一块真正经得住检验的地基。
