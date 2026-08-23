# Layer A 结构化验收测试：设计 v1.0

日期：2026-08-23
状态：设计（实现前）
对应：`docs/GWA-larger-architecture-study-after-v0.9.md` 第 10 节 + 建议先后层次 Layer A 第 6 项

## 1. 目标

把 Layer A 骨架（SemanticAddress、canonical commitment/evidence/acquisition、CommitmentGraph、EvidenceLedger、AgentEpistemicGraph、Query Triage）已经就位这件事，从"代码这样写了"升级成"有测试证明它确实具备 GWA 要求的那几条不变量"。目前 `test/commitment-graph.test.ts`、`test/evidence-ledger.test.ts`、`test/agent-epistemic-graph.test.ts`、`test/canonical-replay.test.ts` 只验证**引用完整性**（悬空引用、重复 ID、冲突值）——这些是必要条件，不是 GWA 要求的那几条核心不变量。四类真正缺失的验收：

1. **V1 Query Confluence**：同一世界状态下，一组纯揭示性查询在不同措辞/不同顺序下，揭示的事实必须一致；
2. **V3 Commitment Closure Integrity**：每个已提交的语义后果，其依赖必须同批次一起进入闭包，不能有"悬空事实"；
3. **V2 Minimal Resolution**：每个操作提交的内容不多不少，正好是让它合法成立所需的最小闭包；
4. **Replay Consistency**：同一份 commit log 重放必须确定性、幂等，canonical/legacy 双写路径等价。

## 2. 诚实的范围边界

当前卧室世界的 fixture 是**完全预先播种**的——`key-1`、`blank-note-1` 等的初始位置都在 `seedCommitments` 里写死提交，不存在真正的 `Free` 投影等待 `ΠS` 首次解析。这意味着：

- V1 Query Confluence **完全可测、有真实意义**——它测的是"多次读取同一个已提交事实，走不同的语言/顺序路径，得到的是不是同一个事实"，这和这个投影是不是 Free 无关；
- V2 Minimal Resolution 在"惰性解析新事实"这个意义上目前**没有着力点**（没有 ΠS 在运行），但可以退化成一个仍然有价值的版本：**每个操作的 commit 内容必须严格匹配它自己声明的 schema 闭包模板，不多不少**——这既是 V2（不多）也是 V3（不少）的同一份检查，只是从两个方向读。文档原文也说"第一版不需要通用逻辑求解器，可以从封闭 schema 的依赖模板开始"，这正是这个退化版本；
- V3 Commitment Closure Integrity 在引用完整性层面已经被 `worldSchema.ts`/`MaterializedWorld.apply()` 兜底（提交不存在的实体会直接抛错），真正没测的是"复合操作的多条 commitment 是否总在同一个 commitPackage 里原子出现，不会出现半个动作"；
- Replay Consistency 的 canonical/legacy 双写等价已经有 `test/legacy-canonical-adapter.test.ts` 覆盖確定性映射；缺的是"重放两次必须字节级相同"这条显式回归钉子，以及把这几类检查统一暴露成一套可复用、可在 eval 里复用的验收接口。

不打算做的：通用 MSRC 求解器、通用 closure 依赖图求解、多模态一致性（V7，这个项目是纯文本）。

## 3. 设计

### 3.1 新模块 `src/verification/acceptanceChecks.ts`

不放进 `src/eval/`（那是真实模型评测脚手架），也不塞进 `src/replay/canonicalReplay.ts`（那是 legacy 兼容重放，语义不同）。新建 `src/verification/`，定位是"确定性、不依赖 LLM 的 GWA 验收检查"，供本地测试和 live eval 共用。

```ts
export interface AcceptanceIssue { code: string; severity: "fatal" | "warn"; message: string }

export function checkCommitmentClosureTemplates(commits: CommitPackage[]): AcceptanceIssue[];
export function checkReplayDeterminism(commits: CommitPackage[], seedCommitments: WorldCommitment[]): AcceptanceIssue[];
export function checkQueryConfluence(runs: QueryConfluenceRun[]): AcceptanceIssue[];
```

### 3.2 `checkCommitmentClosureTemplates`（V2 + V3 合一）

为每个会产生 commitment 的 `ObjectOperationKind` 声明一个**闭包模板**：这个操作合法成立时，`newWorldCommitments` 必须恰好是哪几类 commitment（不看具体值，看"形状"：kind + 涉及的字段）。例如：

- `move`：恰好 1 条 `attribute_set(self, position, *)`；
- `open`/`close`：恰好 1 条 `attribute_set(target, open_state, *)`；
- `take`：恰好 1 条 `relation_ended` + 1 条 `relation_asserted(*, held_by, self)`；
- `place`/`put_inside`：1 条 `relation_ended` + 1 条 `relation_asserted(*, located_on|contained_by, *)`，容器未开时额外允许 1 条 `attribute_set(container, open_state, open)`；
- `write_and_hide`：1 条 `attribute_set(note, inscription, *)` + 1 条 `relation_ended` + 1 条 `relation_asserted(note, contained_by, pillow)`（一起出现，不能只有其中一半）。

检查对存量 store 里的每个 commit：其 `newWorldCommitments` 的"形状"必须匹配某个已声明模板（多了 → V2 违规"过度提交"；少了/不完整 → V3 违规"悬空事实"）。这是封闭 schema 模板，不是通用求解器，符合文档建议。

### 3.3 `checkReplayDeterminism`（Replay Consistency）

对同一份 `commits` + `seedCommitments`：

1. `MaterializedWorld.replay` 跑两次，深度比较 `entities`/`relations` 必须完全一致；
2. `replayCanonicalViews(..., {mode: "diagnostic"})` 跑两次，`issues` 集合必须完全一致（顺序无关）；
3. 打乱 `commits` 数组的传入顺序（保持 `commitSequence` 字段不变，只打乱数组顺序）重放，结果必须与原顺序一致——`MaterializedWorld.replay` 内部已经按 `commitSequence` 排序，这条检查专门用来防止未来有人不小心依赖数组传入顺序而不是 `commitSequence`。

### 3.4 `checkQueryConfluence`（V1）

```ts
interface QueryConfluenceRun {
  probeGroup: string;       // 同一个待验证事实的分组
  orderingLabel: string;    // 这次跑的是第几种顺序/措辞
  revealedFacts: Array<{ subject: string; predicate: string; value: string }>;
}
```

调用方（本地测试或 live eval）负责：从同一个固定前置世界状态出发，对同一组只读查询跑 N 种不同的顺序和/或措辞，把每次揭示的规范事实（entity/relation/value，不是原始回复文本）收集成 `revealedFacts`，交给这个函数比较。检查：同一 `probeGroup` 在不同 `orderingLabel` 下，`revealedFacts` 集合必须完全相同。

本地版本（`test/query-confluence.test.ts`）绕开 LLM，直接用手写的 `ObjectIntent` 通过 `runObjectTurn` 跑多种**顺序**排列（比如"先查钥匙位置再查抽屉内容"vs"先查抽屉内容再查钥匙位置"），零模型成本、确定性、每次 `npm test` 都跑。

真实版本（`src/eval/runQueryConfluenceLiveEval.ts`）额外覆盖**措辞**变化（中/英文、口语化改写）走真实双工位，因为"语言层会不会把同一个事实解析出两个不同回复"这件事只有真实模型才能检验；程序化顺序打乱不需要模型参与。

## 4. 测试计划

- `test/acceptance-checks.test.ts`：单测 `checkCommitmentClosureTemplates`（正例：现有各操作的真实 commit 形状全部通过；反例：手工构造一个"只有 relation_ended 没有 relation_asserted"的残缺 commit，必须被抓出来——检查必须真的有牙齿，不能只在正例上过）；
- `test/query-confluence.test.ts`：本地、零成本、程序化顺序置换的确定性验收；
- `test/replay-determinism.test.ts`：`checkReplayDeterminism` 的单测；
- `src/eval/runQueryConfluenceLiveEval.ts`：真实双工位下的措辞置换确认；
- 把 `checkCommitmentClosureTemplates` + `checkReplayDeterminism` 接进 `src/eval/invariantChecks.ts`（已有的自动化人类模拟测试层），让日常门禁自动带上这两项，不用等专门跑验收套件才发现回归；
- 全量回归：`npm test` + `npm run eval:mvp-gate:live`，确认新增内容不破坏已有 144/144。

## 5. 完成标准

1. 四类检查都有可运行、可复用的实现，不是一次性脚本；
2. 每类检查至少有一个反例测试证明它真的会拒绝违规输入，不是摆设；
3. 现有 144 条真实门禁用例通过这些新检查（证明已完成的 Layer A 骨架经得起验；如果通不过，说明骨架本身有问题，要停下来跟用户讨论，不能削弱检查去迁就现状）；
4. `checkCommitmentClosureTemplates`/`checkReplayDeterminism` 接入日常自动化测试层；
5. 达标后可以在 memory/交接文档里如实写"Layer A 第 6 项完成"，回头继续 Layer B（门外/走廊）。

## 6. 完成情况（2026-08-24）

状态：**完成**，达标第 5 节全部 5 条标准。

实现与设计的一处偏差：第 4 节原计划 `checkReplayDeterminism` 单独放 `test/replay-determinism.test.ts`，实际实现时把它和 `checkCommitmentClosureTemplates` 的正反例一起放进了 `test/acceptance-checks.test.ts`（两者共用同一段真实 action 序列作正例，拆开意义不大）。功能覆盖不变。

### 真实抓到的两个 bug

`checkQueryConfluence` 的真实模型探针（`src/eval/runQueryConfluenceLiveEval.ts`）第一次跑就在真实双工位下发现两个此前没人发现的 bug——这是这套验收测试机制本身有效的直接证据，不是巧合：

1. **target 角色缺少中文方位后缀剥离**：`src/interactionIr/compiler.ts` 里 destination 角色走 `resolveSpatialMention`（认识"抽屉里"这种带"里/上"的说法），但 target/instrument 角色只走严格 `resolveExactMention`。模型把"抽屉里有什么"编译成 `observe` + target="抽屉里" 时就会解析失败，而语义完全等价的"抽屉里面装着什么"（模型编成 `inspect_contents`，target span 恰好不含"里"）却能成功——同一个事实，两种问法，一个能答一个不能，正是 Query Confluence 要抓的那类问题。修复：`ReferenceLexicon` 新增 `resolveGroundedMention`（精确匹配失败后再试剥离"里面/里头/里/中/上面/上"），只接入 target/instrument 绑定路径，不改动 `resolveSpatialMention` 本身（避免影响它靠后缀判断 `contained_by`/`located_on` 的既有逻辑）。
2. **"I" 缺失导致 self 查询在英文下依赖巧合措辞**：`self` 实体的英文别名只有 "self"/"me"，没有裸的第一人称代词 "I"，"where am I" 这类措辞里模型有时会把 "I" 单独作为 `locate` 的 target 传出来，找不到实体。修复：给 `self` 加上 "I" 别名——但这个别名本身差点引入新 bug：`ReferenceLexicon.resolveMention` 的模糊子串匹配会让任意包含字母 "i" 的英文句子都命中 "self"（比如 "did" 里就有 "i"），在本地回归测试里当场炸穿一条既有用例。最终修复是把单个拉丁字母排除出模糊子串匹配路径，只允许精确匹配命中，不动任何 CJK 单字别名（比如"我"）。

两个修复都补了本地回归测试（`test/interaction-ir-compiler.test.ts`、`test/entity-catalog.test.ts`），且都是在**修复过程中亲手复现过退化前的失败**，不是凭猜测改的。

### 验收结果

- 本地零成本测试（`test/acceptance-checks.test.ts` 5 例、`test/query-confluence.test.ts` 2 例）全部通过，含正例（真实 action 序列产生的 commit 全部匹配已声明闭包模板、重放确定性）和反例（人工构造的悬空 commit、过度提交、未知 actionKind 组合、真实分歧场景，逐一确认检查真的会拒绝）；
- 真实模型 Query Confluence 套件（`eval:query-confluence:live`）：3 个事实 × 3 种措辞 = 9 次真实双工位探针，`gatePassed: true`；
- 统一真实门禁 `eval:mvp-gate:live`：**11 组 153/153**，含新增的 `query-confluence` 套件，`fatalReplayIssueCount` 全 0；
- 本地 `npm test`：185/186（唯一失败是已知的 `ssh-server.test.js` 在本环境 Node 24.18.0 下的 SIGSEGV，与本次改动无关）。

Layer A 第 6 项（结构化验收测试）就此完成。按两阶段路线图的排序约定，接下来可以回到 Layer B（门外/走廊空间扩展）。
