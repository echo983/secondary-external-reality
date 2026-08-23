# MVP Interaction IR Shadow Round 1 报告 v1.0

日期：2026-08-23  
状态：旁路实验通过

## 实现

- Interaction IR 1.0.0 封闭 schema；
- speech act、actuality、operation、query mode 和 role 枚举；
- 所有 verb/reference mention 的原文跨度校验；
- 未知字段、实体 ID/权威字段和矛盾 actuality fail-closed；
- linguist 与 safety analyst 两个 Workers AI 工位并行、互不读取对方输出；
- 机械 material consensus，忽略无害 verbSpan 差异；
- 可选 `queryMode: null` 机械归一为省略，但 action 上的真实 query mode 仍被拒绝；
- 独立 live eval，不读取或写入 WorldTruth/LanceDB，不影响 SSH。

## 实验过程

首轮因提示未给出精确嵌套 JSON 模板，两个工位一致把 clause 字段平铺到顶层，validator 正确得到 0/14 全拒绝。补充唯一 JSON 外形后：

- 中间轮：8/14；
- 收紧通用角色、actuality、queryMode 与“不得判断物理能力”合同后：12/14；
- canonicalize 无语义 null 后：连续两轮 14/14。

本地完整回归：159/159。

## 关键真人输入

- `我能拿起笔吗` → `capability_query / non_executing / take`；
- `我拿起笔` → `action_request / actual / take`；
- `抽屉在哪` → `world_query / non_executing / locate`；
- `不要打开抽屉` → `action_request / negated / open`；
- `如果抽屉里有东西就拿出来` → `action_request / conditional / take`；
- `我向空白便签写2236` → `action_request / actual / write`，target 与 content 分离；
- `那我写2236` → write 但 target 缺失；
- `我放下笔` → place 但 destination 缺失；
- `我拿起桌子` 与 `我拿起枕头` → 都是语言上完整的 take，物理能力留给 grounding。

两轮 `unsafeCapabilityExecution` 均为 false。

## 判断与下一步

Interaction IR 已证明适合作为开放语言与动作/查询系统之间的无权威粘合层，但目前只有 14 条语料，不足以直接 active。下一步应将其接入 `BedroomSession` 的持久化 shadow telemetry：每个真人输入都旁路生成 consensus，与旧路由结果对照，但仍完全不影响执行。积累真实分歧后，再进入只具有否决权的 guard 阶段。
