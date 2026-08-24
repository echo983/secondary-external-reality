# 内涵式承诺：可独立重生成性验收 设计 v0.9

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 最后一项（`docs/GWA-larger-architecture-study-after-v0.9.md` §7 "内涵式承诺与可重放生成器"）

## 1. 现状：机制已经在，但从未被独立验证过

`hallway-1`/`living-room-1` 的 `notable_feature` 已经是这个 MVP 里真正的"内涵式承诺"：值不是预写死的，而是由 `resolvePlaceNotableFeature(placeId, seedHash, valueDomain)`——一个确定性、无 LLM 参与的哈希函数——在首次被查询时解析，此后原子提交、永不重新解析。这已经满足 §7 原文对"可重放生成"的定义：

> 确定性、版本化生成器 + 已提交 seed/参数/域

但目前只验证过"重放同一段提交历史两次，结果一致"（`checkReplayDeterminism`）——这证明的是**账本本身**（append-only commits + `MaterializedWorld.replay`）是纯函数，不证明**生成器**本身满足内涵式承诺的核心承诺：只凭 `(placeId, seedHash, valueDomain)` 这几个已提交的参数，脱离提交账本重新跑一次生成器，也必须重新推出和当初提交完全相同的值。这是两个不同层次的确定性——账本重放确定性已经测过，生成器可独立重生成性从来没有专门测过。

这正是路线图"验证重点"提到的：不能把"查询目的、叙事便利、玩家愿望反向参与过去事实的选择"这件事，停留在"代码看起来是这么写的"这个层面——应该有一个真正跑一遍、拿去对比的验收检查，和 Query Confluence/Commitment Closure Integrity 归为同一类"结构化验证代替信任代码"（§10）。

## 2. 方案：一个新的确定性验收检查，独立重新推导并比对

新增 `checkIntensionalCommitmentFidelity(commits, worldBasis)`（`src/verification/acceptanceChecks.ts`，和 `checkCommitmentClosureTemplates`/`checkQueryConfluence`/`checkReplayDeterminism`同一批）：

1. 扫描 `commits` 里所有 `attribute_set` 且 `attribute === "notable_feature"` 且 `entityId` 是已知 Free 投影地点（`hallway-1`/`living-room-1`）的提交；
2. 对每一条，**完全不看提交里记录的值**，只用已提交的 `worldBasis.seedHash` + 该 `entityId` + 该地点的 `valueDomain`，重新调用生成器 `resolvePlaceNotableFeature`；
3. 比对重新推出的值和提交里实际记录的值，不一致就是 `fatal` 级问题——这意味着生成器要么不是真正确定性的，要么中途被换掉了却没有反映在版本/seed 里，两种情况都是对"内涵式承诺"的破坏。

`resolvePlaceNotableFeature`/`PLACE_FREE_PROJECTIONS` 从 `objectTurn.ts` 导出，让验收检查调用**同一份**生产代码，不是照抄一份平行实现——照抄的话，两份实现各自演化出 bug 也会互相"验证通过"，检查就失去意义。顺带清掉 `acceptanceChecks.ts` 里已经存在的 `PLACES_WITH_FREE_NOTABLE_FEATURE` 硬编码集合（和 `PLACE_FREE_PROJECTIONS` 的 key 集合本来就是同一份数据，改成从后者派生）。

## 3. 为什么不新增一个显式的"generatorVersion"字段

`GWA-larger-architecture-study-after-v0.9.md` §1 提到承诺应该记录"schema/operator/version"。这次刻意不新增——原因：

- 目前只有一个生成算法（`resolvePlaceNotableFeature`），从未变过版本。加一个永远等于 `1` 的字段，是 `MVP-canonical-epistemic-kernel-design-review-v1.0.md` 已经点名警告过的"装饰性字段"，不是真实需求；
- 这个 MVP 已经有一个真正在用、且已经被多次验证过的版本粒度：`worldBasis.fixtureVersion`（0.3.0→0.4.0→0.5.0，每次生成算法或规则变化都会跟着升，`runObjectTurn` 已经强制校验提交历史的 fixtureVersion 和当前 fixture 一致，不一致直接拒绝）。生成器算法的任何改动，天然被这个已有机制覆盖，不需要再加一层专门给单一生成器用的版本号；
- 如果以后出现第二个、独立演化的生成器类别（不是简单复用 `resolvePlaceNotableFeature`），到时候再决定要不要给"生成器类别"单独分配版本粒度，比整体 `fixtureVersion` 更细——现在只有一个生成器，没有可验证的对象，不提前设计。

## 4. 测试计划

- 正例（`test/acceptance-checks.test.ts`）：真实解析出 hallway/living-room 的 `notable_feature` 后，`checkIntensionalCommitmentFidelity` 返回空数组；
- 反例：手工构造一条 `attribute_set` 提交，把 `notable_feature` 的值改成和给定 `seedHash`/`valueDomain` 重新推导出的值不同的另一个合法枚举值，`checkIntensionalCommitmentFidelity` 必须报出 `fatal` 级 `INTENSIONAL_REGENERATION_MISMATCH`——证明检查真的会挡住"生成器被换掉但没人注意到"这种情况，不是只做形式校验；
- 真实模型 live eval：新建 `runIntensionalCommitmentFidelityLiveEval.ts`，走一遍真实会话（开门、进走廊、环顾、进客厅、环顾），对产生的真实提交历史跑这个检查，确认端到端也是空问题列表——证明真实玩家会话产生的提交，不只是账本自洽，生成器本身也经得起独立重新推导的验证；
- 全量回归：确认导出 `resolvePlaceNotableFeature`/`PLACE_FREE_PROJECTIONS` 不改变任何行为，只是把已有的私有实现开放给验收层导入。

## 5. 完成标准

1. `checkIntensionalCommitmentFidelity` 是这个 MVP 第一个专门验证"内涵式承诺可独立重生成"的检查，和已有的三类结构化验收（Query Confluence/Closure Integrity/Replay Determinism）并列；
2. 正例通过、反例真的会被拦下来，两者都有测试证明；
3. 检查复用生产代码里的同一个生成器函数，不是平行实现；
4. 不新增装饰性的版本号字段——版本粒度继续由已经在用、已经验证过的 `fixtureVersion` 承担；
5. 现有全部测试和真实模型 gate 保持通过。
