# 阶段2探针：pack 加载器 v1.0

日期：2026-08-24
分支：`experiment/stage2-pack-loader-probe`（从 `main` 分出，未合并）
性质：实验记录，不是设计文档。目的仅仅是"内核第一次吃外部内容会在哪里卡住"，不是产出一个能用的加载器。

## 1. 做了什么

用 `docs/STATUS-four-stage-maturity-assessment-v1.0.md` §6 提到的真实产出物——`content-pipeline/sdlpal-import` 分支生成的 `part1-authored.pack`（17 个地点、247 个实体，未提交，仅本地物理存在）——尝试走通"parse → 转换成 WorldCommitment → `MaterializedWorld.replay()`"这条最短路径，不追求好用，只追求"能不能过"。

新增文件（都在这个探针分支上，尚未决定是否合入 `main`）：
- `src/world/packFormat.ts`——`content-pipeline/pack-format/src/parser.ts` 的临时复制品，不是 import（那份代码只存在于另一个未合并分支的历史里，`src/` 依赖不到）。
- `src/world/packLoader.ts`——最小加载器，只产出 `entity_created` + `attribute_set(zh_name)`，以及一条实体→地点的关系。
- `src/eval/runPackLoaderProbe.ts`——一次性验证脚本，不接 LLM，不是常规 live-eval gate 的一部分。
- `src/world/worldSchema.ts`——加了一行 `prop` 实体类型（唯一的常规 schema 改动）。

结果：`267` 条记录解析 0 错误，`replay()` 不抛异常，264 个实体（17+247）、247 条关系全部物化成功。

## 2. 探出来的真实缺口

这些是探针的主要产出，比"代码能跑"本身更值得记录：

1. **没有"实体在某地点里"这个关系谓词。** 现有 `predicates` 只有 `located_on`/`contained_by`/`held_by`/`part_of`。`located_on` 的校验要求宾语是 surface 或 bed（`materializedWorld.ts` 的 `apply()`），地点两者都不是，会直接抛异常——不是语义不贴切，是**根本跑不通**。最后用 `part_of` 顶上，因为它是唯一没有额外校验限制的谓词，但 `part_of` 原本的语义是结构性组成（抽屉是床头柜的一部分），拿来表示"这个 NPC 身处这个地点"是明知不对但唯一能过的选择。这是阶段2该定义的一个真正的新谓词，现在这个 schema 里完全没有对应物。
2. **`attrs`（sprite/trigger_mode/state）没有落脚点。** 这些是 sdlpal 管线自己的溯源元数据，不是这个内核意义上的 WorldTruth 属性；探针选择直接丢弃，不是因为不重要，是因为当前 schema 没有、也不该有一个专门装"引擎无关但来源相关"信息的地方。
3. **没有自由文本叙事层。** 每个 authored 实体本来带一段人物小传（`---` 之后的叙事体），探针完全没有加载它——这一层此前只停留在概念讨论（[[project-vision-first-experience-instance]] 里的 semi-structured entity 构想），从未真正实现过落点。
4. **地点邻接关系是硬编码 TypeScript，不是数据。** `PLACE_ADJACENCY` 活在 `objectTurn.ts` 里；pack 文件里 17 个地点已经带着人工标注的 18 条边（`adjacent:` 字段），这次探针完全没有使用，因为内核目前根本没有"邻接关系作为 WorldCommitment"这条路径。

## 3. 判断

以上四条不是这次探针要解决的问题，是阶段2要正式回答的问题（`docs/STATUS-four-stage-maturity-assessment-v1.0.md` 已经列过前两条,这次探针把"地点邻接是硬编码"和"没有地点内关系谓词"这两条从猜测变成了有真实数据支撑的确认，而且发现"没有地点内关系谓词"比原来想的更严重——不是缺一个更精确的名字，是现有谓词校验规则会直接拒绝这个用例）。

`prop` 实体类型的 schema 改动本身没有引出新问题——它就是按已有模式（`person`/`bed`/... 的字面量集合）加了一行,不构成任何新决策。

这次探针没有遇到阻断性障碍——"能不能把外部内容变成合法 WorldCommitment 并通过 replay"这个核心问题的答案是**能，但要绕开至少一个校验规则本不该允许绕开的地方（`part_of` 顶替）**。这个"能，但绕得不体面"本身就是阶段2最该优先处理的具体内容，不是一个模糊的"以后要做 schema 扩展"式判断。

## 4. 不建议做的事

不建议现在就把 `part_of` 当成正式方案合并到 `main`——它是探针为了验证可行性特意选的将就用法，一旦当真，会把"部件"和"在场"两个不同概念混进同一个谓词里，后续任何读关系图的代码都得知道这个坑。阶段2真正定义"地点内关系谓词"时应该加一个新谓词（比如 `present_at`），而不是继续借用 `part_of`。
