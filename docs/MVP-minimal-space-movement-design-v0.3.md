# MVP 最小空间与移动纵切面：设计 v0.3

日期：2026-08-23
状态：设计（实现前）
基线：`56e9cdb feat: add automated human-simulation testing layer`

## 1. 目标（一句话）

让角色的"位置"第一次成为一个能被真实改变、被记住、被观察到的世界事实，而不是永远焊死在一个点上——范围严格限定在卧室内部的两个点：床边（起点）与门口。门外依旧不开放。

## 2. 范围边界（明确排除）

- 不新增 `place`/PlaceGraph 实体类型，不新增关系谓词；
- 不做门外/走廊/其他房间；`看看门外` 继续走现有的 `UNRESOLVED_REFERENCE`/boundary 路径，本设计不touch这条链路；
- 不给现有 `open`/`close`/`take`/`place` 等操作加位置前置条件（避免破坏现有全部回归测试）；
- 不耦合 posture 状态机或 body_feedback 叙事细节（那是已冻结的 v0.1 demo `bedroomTurn.ts` 的专属叙事，与本设计完全独立，不复用、不修改）；
- 不做可达性图、不做多跳寻路——只有 2 个位置，move 是纯粹的"直接切换"。

## 3. 现状盘点（为什么这是最小改动）

- `src/world/worldSchema.ts` 里 `person` 实体的 `attributesByType` 已经声明了 `posture`/`position`，并且 `validateAttribute` 已经把 `position` 的合法值锁定为 `["bedside", "doorway"]`、`posture` 锁定为 `["sitting_on_bed_edge", "standing"]`。
- `src/world/objectFixture.ts` 的 `self` 实体种子提交里已经写了 `posture: "sitting_on_bed_edge", position: "bedside"`——起始状态早就是"合法的、已提交的世界事实"。
- `src/turn/objectTurn.ts` 里 `self_position`/`self_posture` 查询早就能正确读出这两个属性。
- **缺的唯一一环**：没有任何 `ObjectOperationKind` 会真正对 `self.position` 发起 `attribute_set` 提交。`move` 目前只在 `parseObjectIntent`（旧正则层）里完全不存在，在 `interactionIr/compiler.ts` 的 `operationMap` 里也没有映射，所以 Interaction IR 即使正确解析出 `operation: "move"`，compiler 也只会返回 `UNSUPPORTED_OPERATION`。
- 另有一套完全独立、已冻结的旧实现：`bedroomTurn.ts` + `bedroomFixture.ts`（`BEDROOM_PROJECTIONS.posture`/`.position`）+ `world/intent.ts`，只在 `parseMvpIntent(rawTtd).actions` 精确等于 `stand,move,open` 时触发，服务于 v0.1 时代一个单一的硬编码演示（固定台词"你从床沿站起来时，发麻的左腿……"）。它和 `MaterializedWorld`/`objectFixture` 体系完全不共享数据。本设计不修改这个文件，也不会让新的 `move` 测试语料撞上它的精确匹配（只要不在一句话里同时说"站起来"+"走"+"开门"三个动作）。

结论：这不是"设计一个新的空间系统"，是"把已经声明好但从没被写入过的世界事实，接上一条真正的提交路径"。

## 4. Place 身份怎么定义

不新增实体。门口/床边直接复用已有的地标实体做语义锚点：

- `door-1`（已存在，别名含"门"/"door"）→ 代表位置 `doorway`；
- `bed-1`（已存在，别名含"床"/"bed"）→ 代表位置 `bedside`。

新增少量别名，让"走到门口"/"回到床边"这类自然说法能被 `ReferenceLexicon` 精确解析到这两个地标实体：

- `door-1.names` 追加 `"门口"`、`"doorway"`；
- `bed-1.names` 追加 `"床边"`、`"bedside"`。

`move` 的目的地绑定完全复用现有 `resolveSpatialMention` 的通用角色绑定代码路径（和 `place`/`put_inside` 的 destination 绑定是同一段代码），不需要新写解析逻辑。

地标实体 ID → 目标 `position` 值的映射，是一张写死在执行层（`objectTurn.ts`）的小表：

```ts
const MOVE_DESTINATIONS: Record<string, "bedside" | "doorway"> = {
  "door-1": "doorway",
  "bed-1": "bedside",
};
```

这张表本身就是这次唯一新增的"PlaceGraph"——两个节点，写死，不做成通用图结构，因为 I7 MinimalCommitment 要求只提交当前操作需要的最小闭包，没有第三个位置就不该抽象出通用图。

## 5. `move` primitive contract

**前置条件**：
- 目的地地标能唯一解析到 `MOVE_DESTINATIONS` 里的一个 key（否则走现有的 `UNRESOLVED_REFERENCE`/"No landmark matched" 通用降级路径，不用特判）；
- 目标位置 ≠ 当前 `self.position`（已经在那了 → `ObjectTurnError`，中文"你已经在门口了。"/英文"You are already at the doorway."）。

**事件**：`event-move-{commitSequence}`，`actionKind: "move"`，`outcome: "success"`，`subjectRef: "self"`，`objectRef: <landmark entityId>`。

**Commitment**（唯一的世界事实变化）：
```ts
{ kind: "attribute_set", entityId: "self", attribute: "position", value: <目标值> }
```
不动 `posture`，不产生 body_feedback，不产生任何其他实体的状态变化——这就是 MSRC：让这个操作合法成立所需的最小闭包。

**一致性检查**（`fact(...)` 条件，防止并发下的过期前提）：读取时把当前 `self.position` 的属性 revision 作为 `entity:self.position` 的相等条件纳入 candidate 的 `conditions`，和现有 `open`/`close` 对 `open_state` 的处理方式完全一致。

**T1 CommitBeforeExpose**：走和其他操作完全相同的共享尾路（`commitCandidateEnvelope`），先 candidate→一致性检查→commit，再渲染 response，不提前措辞。

## 6. 观察 scope 的最小联动（实现中descoped）

原计划：`look_around` 回复文案按 `self.attributes.position` 做措辞区分（"你站在门口环顾四周" vs "你环顾四周"）。

**实现时发现这个设想低估了复杂度，已经明确不做**：`look_around` 带 `queryKind`，最终 response 不是 `objectTurn.ts` 里那个本地字符串——它会被 `commitCandidateEnvelope` 产出的 `canonical.presentationPacket` 通过 `DeterministicPresentationRenderer`/`RiskAwarePresentationRenderer` 重新渲染（只读 `observed_entities` 这个 approved presentation item，不知道 position 是什么）。要让文案真的随位置变化，需要新增一种 presentation item（比如把 `self.position` 作为一条 evidence 写进 packet）并同步改渲染器，这已经超出"读一个已提交属性做措辞"的分量，不是 MSRC 意义上的最小闭包。

按 I7（只提交/只做当前操作合法成立所需的最小改动）明确 descope：本轮 `look_around` 文案不随位置变化，`self.position` 依然可以通过 `我在哪里` 之类的 self-query 如实读到，只是 look_around 的呈现层暂不消费它。这不影响第 9 节的完成标准（标准里从未要求 look_around 文案随位置变化）。

## 7. Interaction IR 接入

- `src/world/objectIntent.ts`：`OBJECT_OPERATION_KINDS` 追加 `"move"`；`parseObjectIntent` 追加一条移动的正则识别（旧路径兼容，不是当前主链依赖的部分，但要保持行为对称）。
- `src/interactionIr/compiler.ts`：`operationMap` 追加 `move: "move"`；`["place", "put_inside"].includes(operation)` 的目的地必填集合追加 `"move"`（复用现成的 `MISSING_DESTINATION` 校验，不新增校验代码）。
- `src/turn/objectTurn.ts`：`runObjectTurn` 新增 `move` 分支，实现第 5 节的 contract；`look_around` 分支追加第 6 节的措辞联动。

**明确不动**：`bedroomTurn.ts`、`bedroomFixture.ts`、`world/intent.ts`——这是独立冻结的历史演示层，不参与本次改动，也不需要迁移。

## 8. 测试计划

- 本地单测：
  - `test/interaction-ir-compiler.test.ts`：`move` 目的地缺失时返回 `MISSING_DESTINATION`；地标别名（"门口"/"doorway"/"床边"）能正确绑定到 `door-1`/`bed-1`。
  - `test/object-turn.test.ts`：床边→门口成功提交 `position=doorway`；已在目标位置时报错；目的地不是已知地标（比如"走到桌子那"）走通用降级路径而不是崩溃。
- 语料自动化层：往 `humanSimCorpus.ts` 加 `move` 意图模板（含中英文、口语变体），让日常门禁自动覆盖新增能力，顺带用已有的不变量检测器（提交纪律、paraphrase 一致性）自动验证。
- 真实模型状态化 sequence：新增一条 live eval（复用 `runPlacementFailureSequenceLiveEval.ts` 的模式），跑"走到门口 → 我在哪里 → 环顾四周 → 走到床边 → 我在哪里"完整往返，验证双工位真实解释下的端到端行为与最终 `self.position` 状态。
- 全量回归：`npm test` 本地 + `npm run eval:mvp-gate:live` 真实门禁，确认新增内容不破坏已有 136/136。

## 9. 完成标准

1. `走到门口` 真正提交一次 `self.position: bedside → doorway`，`我在哪里` 能读到新值；
2. `看看门外` 依旧合法返回未建模边界，不因为站在门口而开始编造门外内容；
3. 现有 136 条真实门禁用例全部保持通过（不新增任何对现有操作的前置条件）；
4. 新增本地测试 + 语料自动化 + 真实 sequence 全部通过；
5. 门口↔床边往返本身要在真实双工位模式下稳定（不是偶发通过）。

达标即视为本阶段完成；若测试暴露出这份设计站不住脚（比如地标复用方案在真实模型下歧义率过高），停下来改设计，不硬撑实现。
