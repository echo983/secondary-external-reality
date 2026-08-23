# 里程碑：最小空间与移动纵切面 v0.3.0

日期：2026-08-23
状态：完成
设计：[MVP-minimal-space-movement-design-v0.3.md](MVP-minimal-space-movement-design-v0.3.md)

## 达成

- `move` 成为真正的 `ObjectOperationKind`：`src/world/objectIntent.ts`、`src/interactionIr/compiler.ts`（`operationMap` + `MISSING_TARGET`/`MISSING_DESTINATION` 归类）、`src/turn/objectTurn.ts`（新增执行分支，含一致性检查条件、`action_result` 事件、`attribute_set self.position` commitment）；
- 复用既有地标实体做 Place 锚点，不新增实体类型或谓词：`door-1` 追加别名"门口"/"doorway"代表 `doorway`，`bed-1` 追加别名"床边"/"bedside"代表 `bedside`；执行层用一张写死的双节点表把地标实体映射到 position 值；
- `走到门口` 真正提交一次 `self.position: bedside → doorway`，`我在哪里` 能读到新值；重复走到同一位置、走到非地标目的地都能被安全拒绝、零提交；
- `看看门外` 在玩家已站到门口之后依然正确返回未建模边界，没有因为站到门口就开始编造门外内容；
- 顺带修复两个真实 bug（都是这个功能第一次让相关代码路径可达才暴露出来的）：
  1. `src/world/referenceLexicon.ts`：英文提及（"the note"、"a key"）因为严格精确匹配、没剥前导冠词，导致 100% 解析失败；
  2. `src/presentation/renderer.ts`：`self.attribute:position` 的确定性渲染只翻译了 `bedside`，`doorway` 会直接把英文枚举值渲进中文句子（"你在doorway。"）；
- 明确 descope：`look_around` 文案不随位置变化（渲染器是 packet 驱动的，要做对需要新的 presentation item，超出本轮 MSRC，设计文档 §6 记录了原因）；不给现有 `open`/`close`/`take`/`place` 加位置前置条件，不做 posture/body_feedback 联动，不碰独立冻结的 v0.1 `bedroomTurn.ts`/`bedroomFixture.ts` 演示层。

## 自动化测试基础设施（本轮同步交付）

- `src/eval/humanSimCorpus.ts` + `runHumanSimulationCorpusLiveEval.ts`：带种子的结构化语料生成器，接入 `runMvpLiveGate.ts` 成为日常门禁第 9 组套件，新增 `move`/`self_position` 意图模板；
- `src/eval/runHumanPersonaExplorationLiveEval.ts`：3 个 LLM 人设自由探索多轮对话，按需手动触发，不进日常门禁；
- `src/eval/invariantChecks.ts`：纯不变量检测器（提交纪律、内部状态泄露、关闭容器泄露、I4b 同义改写一致性 + canonical replay fatal issue），本轮修正了 severity 分级——同义改写里"一条解析成功、一条因双工位偶发分歧安全拒绝"这种覆盖度缺口，从 fatal 降级为 warn，不再和真正的事实冲突混为一谈；
- 修正 `runHumanSimulationCorpusLiveEval.ts` / `runHumanPersonaExplorationLiveEval.ts` 的 gate 判定 bug：之前把任意 severity 的 violation（含 warn）都当失败，应该只有 fatal 才拦门禁；
- 新增 `src/eval/runMoveSequenceLiveEval.ts`，真实双工位状态化 sequence，覆盖门口↔床边往返、重复移动拒绝、非地标目的地拒绝、移动后门外边界仍然成立；
- 更新过期回归断言：`test/interaction-ir-compiler.test.ts`、`test/object-turn.test.ts`、`src/eval/runHumanRound3SequenceLiveEval.ts` 里原先断言"走到门口不支持"的用例，改为断言新的、正确的支持行为。

## 验收

- 本地：181/182（唯一失败是已知的 `ssh-server.test.js` 在本环境 Node 24.18.0 下的 SIGSEGV，与本次改动无关，另见项目 memory 记录）；
- 真实 Workers AI 统一门禁：10 组 **144/144**，`fatalReplayIssueCount` 全部为 0；
- `move-sequence` 真实双工位状态化序列：8/8，最终 `self.position` 状态正确回到 `bedside`；
- `human-round3-sequence`：更新断言后 7/7；
- `human-simulation-corpus`：40/40，0 fatal violation。

## 设计判断

Place 身份没有新造一套通用图结构——只有两个节点时，通用 PlaceGraph 是过度设计，违反 I7 MinimalCommitment。复用已有地标实体做锚点，把这次改动压缩成"接上一条本该存在、但从未真正写入过的提交路径"，而不是"设计一个新的空间系统"。`schema`/`fixture` 层其实早就预留了 `position`/`posture` 字段（`worldSchema.ts` 已校验 `bedside`/`doorway`，`objectFixture.ts` 种子已提交初始值），只是从没有任何操作真正写过它们——这也是本轮唯一严格缺失的一环。

## 下一边界

尚未实现：门外/走廊/其他房间的 PlaceGraph、`posture` 与移动的联动、`look_around` 随位置变化的呈现层改动、可达性/邻接的通用表示。真人（或人设探索层）验证过床边↔门口这一步稳定后，再考虑往门外做第二次空间扩展；`看看门外` 在那之前必须持续返回未建模边界，不得让模型现场编造。
