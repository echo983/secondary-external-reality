# 阶段2 · `present_at` 关系谓词设计 v1.0

日期：2026-08-24
依据：`docs/STAGE2-BOUNDARY-DEFINITION-v1.0.md` 第2项，四步实现顺序里的第一步（风险最低，直接解决探针发现的真阻塞）。

## 1. 问题

`docs/PROBE-stage2-pack-loader-v1.0.md` 实测确认：现有 `predicates`（`located_on`/`contained_by`/`held_by`/`part_of`）里没有一个能表示"实体在某地点里"。`located_on` 的校验要求宾语必须是 surface 或 bed（`materializedWorld.ts` 的 `apply()`），地点两者都不是，直接抛 `MaterializedWorldError`。探针用 `part_of` 顶替，但那是结构性组成关系（抽屉是床头柜的一部分），语义上是错的，明确不建议合入正式代码。

## 2. 设计

新增关系谓词 `present_at`：
- **校验规则**：宾语（`objectId`）必须是 `entityType === "place"` 的实体；主语没有类型限制（人、道具都可以 present_at 一个地点）。
- **互斥规则**：一个实体同一时刻只能有一条活跃的 `present_at` 关系——不能同时"在"两个地点。这条独立于现有 `located_on`/`contained_by`/`held_by` 的互斥组（那组管的是"精确物理承载"，`present_at` 管的是"粗粒度地点归属"，两者是不同的轴，本次不强制二者互斥，即一个物体可以同时 `located_on` 某桌子、也 `present_at` 某地点——但这次不实现这种复合推导，只保证 `present_at` 自身的互斥）。
- **不做环检测**：地点不会互相嵌套（`present_at` 的宾语恒定是 place，place 不会再 present_at 别处），不存在环的可能，不需要像 `contained_by` 那样做环检测。

## 3. 明确不在这一步做的事（留给后续步骤）

- 不把 `present_at` 接入 `directLocation`/`structuralLocation`/`isEntityPerceivable` 等现有感知/可达性逻辑——那需要先想清楚"地点内的实体如何被感知/移动"这一整套规则，属于后续步骤（schema 注册表、加载器）的范围。
- 不修改探针分支（`experiment/stage2-pack-loader-probe`）里 `packLoader.ts` 的 `part_of` 用法——那条分支的探针已经收尾存档，不回头改；等真正做"内容包加载器"这个阶段2/3的工作时再切换成 `present_at`。
- 不改动卧室 fixture——`bedroom` 从未被建模成一个 Place 实体，这次不补，与本步骤无关。

## 4. 验收

- 正例：实体 `present_at` 一个真实 place 成功。
- 反例：宾语不是 place（拒绝，报错信息包含"place"关键字）；同一实体重复 `present_at`（不先 ended）被拒绝，复用现有"asserted twice without ending"报错路径。
- 本地测试 + 全量回归（`npm test`），不涉及真实模型 live-eval（这是纯 schema/校验层改动，不涉及自然语言解析）。
