# 客厅：PlaceGraph 第二次扩展设计 v0.5

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 第 1、3 项延续（docs/MVP-hallway-placegraph-design-v0.4.md 之后）

## 1. 目标

走廊那次证明了"Free 投影 + 确定性 ΠS + 首次可寻址即提交"这条纪律在这个 MVP 里真的能落地，但只在一个地方做过，实现里有两处是照着走廊的具体情况写的，还没证明能不能泛化：

1. `move` 的"门必须开着"前置条件是硬编码 `if (destination === "hallway") { 查 door-1 }`，而且只挡了"走进走廊"这一个方向——站在走廊里把门关上，现在仍然能直接走回卧室（`move` 到 `bedside`/`doorway` 完全不检查门状态）。这是走廊那次遗留的一个真实不一致，这次一起修。
2. `resolveHallwayNotableFeature`/走廊专属分支目前是给 `hallway-1` 量身写的，函数名、分支条件都绑死了这一个实体。

这次加客厅（`living-room-1`），**不是简单再复制一份走廊的代码**，而是先把这两处通用化，再让客厅复用通用机制——如果这个泛化做不干净，说明走廊那次的实现本身有问题，要停下来重新看，不能将错就错再叠一层。

## 2. 空间拓扑

严格线性，不做分支：`床边/门口（卧室）↔ 走廊 ↔ 客厅`。`self.position` 从三值枚举扩展到四值：`bedside | doorway | hallway | living_room`。

不打通用 PlaceGraph 图数据结构的算——四个节点、一条链，仍然用一张小的静态邻接表就能表达清楚，不需要引入通用寻路/图遍历。但这次要把邻接和前置条件从"移动分支里的 if"提升成一张**显式的邻接表**，而不是继续在 `move` 分支里堆更多特判：

```ts
interface MoveEdge { to: PositionValue; requiresOpenDoor?: string } // entityId of the door gating this edge

const PLACE_ADJACENCY: Readonly<Record<PositionValue, readonly MoveEdge[]>> = {
  bedside:      [{ to: "doorway" }, { to: "hallway", requiresOpenDoor: "door-1" }],
  doorway:      [{ to: "bedside" }, { to: "hallway", requiresOpenDoor: "door-1" }],
  hallway:      [{ to: "doorway", requiresOpenDoor: "door-1" }, { to: "bedside", requiresOpenDoor: "door-1" }, { to: "living_room" }],
  living_room:  [{ to: "hallway" }],
};
```

**实现时的修正**（首次跑现有测试才发现）：最初写这份设计时漏掉了 `bedside↔hallway` 的直连边，只保留了 `doorway↔hallway`。但走廊那次（v0.4）实现的真实行为一直是"床边和门口都能直接走到走廊"（`MOVE_DESTINATIONS` 是一张平的目的地表，从未按当前位置做过邻接限制），已经被 `runHallwaySequenceLiveEval.ts` 等测试实际验证过。严格按"门口才是走廊的唯一邻居"重写会把这条已经跑通的路径变成需要先走到门口的两步操作——这不是本次要修的 bug，是本次实现引入的新回归，所以邻接表改为床边、门口都直连走廊，双向都查 `door-1`。真正要修的 bug只是"四个方向里只查了一个方向"，不是"床边不能直连走廊"。

- 卧室内部（床边↔门口）：无前置条件，和现在一样；
- 床边/门口↔走廊：`door-1` 必须开着——**四个方向都要检查**（床边→走廊、门口→走廊、走廊→床边、走廊→门口），修掉现存的单向漏洞；
- 走廊↔客厅：无前置条件（开放过道，不设第二扇门）。故意不重复"开门"这个已经验证过的机制，把这次的力气花在证明泛化上，而不是把同一个机制再测一遍。

`move` 分支的实现从"目的地是不是 hallway"的特判，改成查 `PLACE_ADJACENCY[currentPosition]` 里有没有一条到目标的边，有 `requiresOpenDoor` 就检查对应门的状态。这本身就是对走廊那次代码的重构，不是纯新增。

## 3. 客厅的 Free 投影

新增 `living-room-1`（entityType `place`），别名 `["客厅", "living room", "living_room"]`——这也终结了 `humanSimCorpus.ts` 里"走到客厅"作为"仍未建模"的占位例子的效力，需要同步更新那条语料（这次真的要往后放一个新的仍未建模目标，或者干脆不再用地点做"不支持"的例子）。

和走廊一样只留一个 Free 投影：`living-room-1.notable_feature`，值域是独立的封闭枚举（不复用走廊那套家具值，客厅该有客厅自己合理的东西）：

```text
notable_feature ∈ { "none", "bookshelf", "floor_lamp", "framed_painting" }
```

**解析机制通用化**：把 `resolveHallwayNotableFeature(seedHash)` 改成 `resolvePlaceNotableFeature(placeId, seedHash, valueDomain)`，走廊和客厅共用同一个函数，只是传入不同的 `placeId`（作为哈希输入的一部分，保证两个地方即使值域相同也不会解析出相关联的值）和各自的枚举值域。触发这次解析的分支（`look_around`/`observe`/`inspect_contents`/`locate` 目标是某个 place 实体）也要从"硬编码认 `hallway-1`"改成读取一张 `entityId → { valueDomain, ... }` 的小表，用同一段逻辑处理任意一个 place 实体，不是 `if (target === "hallway-1") {...} else if (target === "living-room-1") {...}` 式的复制粘贴。

## 4. 可见性

`ROOM_SCOPED_ENTITIES`/`isEntityPerceivable` 里的房间概念从两值（bedroom/hallway）扩展到三值（bedroom/hallway/living_room）。走廊↔客厅之间没有门，所以客厅从走廊一侧**始终可见**（不像走廊从卧室一侧需要门开着才可见）——这本身也是对"可见性 gating 是不是被写死成必须有门"的一次检验：如果泛化做得对，"无门开放通道"应该只是"永远满足的前置条件"这个特殊情况，不需要另写一套可见性逻辑。

## 5. 明确排除

- 不做客厅之外的第三层空间；
- 不做客厅到卧室的"抄近路"或任何非线性连接；
- 不给客厅加第二个 Free 投影，机制验证优先于内容堆量；
- 不做家具类实体的动态实例化（比如解析出"有书架"之后不会真的生成一个可翻查的书架实体）——这依然是 GWA 讨论过的"动态实体创建"未开放范围。

## 6. 测试计划

- 本地测试：`move` 邻接表的正反例（含双向门检查——在走廊关上门之后应该走不回卧室，这是对走廊那次遗留 bug 的专项回归）；客厅 Free 投影首次解析、重复读取幂等；走廊和客厅两个地方各自独立解析、互不干扰（不会因为共用同一个泛化函数就解析出相同或关联的值）；
- `checkCommitmentClosureTemplates` 为客厅新增的形状条目；
- 真实模型 live eval：完整路径"卧室→开门→走廊→环顾(走廊解析)→客厅→环顾(客厅解析)→走廊→关门→尝试走回卧室应该失败→重新开门→回卧室"，覆盖双向门控制和两次独立 Free 解析；
- 全量回归：`npm test` + `npm run eval:mvp-gate:live`，确认不破坏已有 160/160。

## 7. 完成标准

1. 门在走廊一侧关闭后，无法直接走回卧室，必须重新开门——修掉现存的单向漏洞；
2. 客厅的 Free 投影首次查询解析、此后永久固定，走廊和客厅互不干扰；
3. `resolveHallwayNotableFeature` 之类的走廊专属代码被通用化，客厅复用同一套机制而不是复制一份；
4. 现有真实门禁用例保持通过；
5. 达标即说明"Free 投影 + ΠS"这套机制经受住了第二次独立验证，不是只在走廊这一个特例上凑巧能跑。
