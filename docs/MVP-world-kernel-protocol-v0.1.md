# MVP 世界内核协议 v0.1

状态：实验协议草案  
目标：约束 LLM 只能提出和审查世界变化，不能私自决定或提交现实。

## 1. 权限边界

| 组件 | 可以做 | 不可以做 |
|---|---|---|
| 意图解析器 | 规范化主体、动作、目标与明确修饰词 | 宣布行动成功 |
| 条件化候选器 | 枚举结果分支及其依赖的世界投影 | 偷偷给未解析投影赋值 |
| 世界解析器 | 对获得语义地址的最小投影 resolve-and-commit | 为剧情效果选择值 |
| 可信性陪审员 | 找出因果错误、越权事实和认识越界 | 决定隐藏条件、直接写修正版世界 |
| 确定性收束器 | 根据已提交事实选择候选、检查 revision、提交事务 | 接受 schema 外字段 |
| 呈现器 | 将已提交结果表达为同语言自然反馈 | 反向创造 WorldTruth |

## 2. 最小动作词汇

MVP 初始动作族：

```text
stand
move
reach
take
open
speak
observe
recall
```

每个动作由主体、目标、前置条件和预期效果构成。一个 `ttd` 可以规范化为动作链，但规范化不表示动作已经发生。

## 3. 意图协议

```json
{
  "turn_id": "turn-...",
  "actor_id": "self",
  "input_language": "zh",
  "raw_ttd": "我立刻站起来走到门边开门",
  "actions": [
    {"action_id": "a1", "kind": "stand", "target_id": null},
    {"action_id": "a2", "kind": "move", "target_id": "door-1"},
    {"action_id": "a3", "kind": "open", "target_id": "door-1"}
  ]
}
```

## 4. 投影状态

候选引用的世界投影必须处于以下状态之一：

```text
known       已提交，可精确读取
unknown     尚未解析，但有合法 SemanticAddress
unsupported MVP 内核尚无此能力，不能由 LLM 补写
```

`unknown` 不等于随机，也不等于不存在。

## 5. 条件化候选协议

候选器不能被强制制造三个不同故事。它输出零至多个有实际逻辑差异的条件分支；若只有一个合法结构，就只输出一个。

```json
{
  "candidates": [
    {
      "candidate_id": "c1",
      "outcome_kind": "success|partial|failure|boundary",
      "requires_resolution": [
        {
          "projection": "entity:self.body.left_leg.support_capacity_now",
          "reason": "区分能否完成站立",
          "allowed_values": ["sufficient", "impaired", "insufficient"]
        }
      ],
      "conditions": [
        {
          "projection": "entity:self.body.left_leg.support_capacity_now",
          "operator": "eq",
          "value": "sufficient"
        }
      ],
      "proposed_events": [],
      "proposed_state_changes": [],
      "observations": [],
      "new_world_commitments": []
    }
  ]
}
```

规则：

- 所有条件必须引用 `known` 或列在 `requires_resolution` 中的投影；
- 候选不得用自然语言暗含未声明条件；
- `requires_resolution` 必须说明为何是当前操作的最小必要项；
- 候选间只因条件或合法结果不同而分支，不为文风制造分支；
- 主体愿望、叙事效果和当前问题目的不能成为过去或外部事实的解析条件；
- `new_world_commitments` 只描述若该候选被选中后真正新增的世界事实。

## 6. 规则预检

陪审前由代码执行：

1. JSON/schema 校验；
2. candidate ID 唯一性；
3. SemanticAddress 格式和引用存在性；
4. 条件引用闭包检查；
5. 禁止在 `conditions` 中引用未声明投影；
6. `proposed_state_changes` 必须能追溯到动作或事件；
7. 对语义相同候选去重；
8. 拒绝包含自由文本隐藏事实但未列投影的候选。

第 8 项第一版由陪审员辅助发现，后续逐渐转为类型化检查。

## 7. 最小投影解析

世界解析器只解析区分可行候选所必需的投影：

```text
读取已提交上下文
→ 收集合法候选 requires_resolution
→ 合并相同 SemanticAddress
→ 删除不影响候选区分的请求
→ resolve-and-commit
→ 更新候选条件求值
```

任何语义世界投影一旦被解析，必须在同一事务中提交；不存在“读取后暂不提交”的状态。

## 8. 陪审协议

陪审员收到：

- 输入已有事实；
- 规范化意图；
- 已完成条件求值的候选；
- 每个候选拟提交的事件、状态变化和观察。

陪审员只输出审查报告：

```json
{
  "candidate_id": "c1",
  "verdict": "pass|fail",
  "violations": [
    {
      "code": "UNDECLARED_DEPENDENCY",
      "path": "proposed_events[0]",
      "reason": "事件依赖未声明的手部可达性"
    }
  ]
}
```

陪审员不得：

- 从多个可能世界中选择喜欢的一个；
- 用自己的修正文案直接替换候选；
- 以 confidence 自动通过；
- 把“更常见”当作“已经发生”。

## 9. 确定性收束

候选只有在以下条件全部满足时才能提交：

```text
schema valid
∧ all required projections committed
∧ all conditions true
∧ rule precheck passed
∧ jury passed
∧ referenced revisions unchanged
```

若多个候选同时成立，优先选择新世界承诺成本更低者；若仍无法区分，返回边界或要求进一步最小解析，不允许随机挑故事。

## 10. 提交包

```json
{
  "turn_id": "turn-...",
  "base_revision": 14,
  "selected_candidate_id": "c1",
  "events": [],
  "entity_patches": [],
  "relation_patches": [],
  "epistemic_changes": [],
  "observations": [],
  "new_revision": 15
}
```

提交成功后，呈现器只能读取该提交包与获准的既有事实。

## 11. v0.1 验收条件

- 未声明投影不能出现在条件或提交包中；
- “困难”不能在没有判据时变成“不可能”；
- 未解析条件不能被陪审员选择成现实；
- 正确的认识边界可以在不生成外部事实的情况下结束回合；
- 同一 base revision 的相同已解析输入得到相同结构化收束；
- 任一模型失败、超时或输出非法 JSON 时，不产生部分世界提交。

## 12. 首次协议实验后的强化项

首次 Qwen → 规则预检 → 固定投影解析 → Mistral 审查实验暴露出以下必须机械检查的条件：

1. `facts` 也必须使用类型化地址与值，不能以自由文本字符串进入条件；
2. 每个 `requires_resolution` 投影必须至少出现在一个 `condition` 中，否则请求解析却不参与分支判定；
3. `conditions` 只能引用 registry 中的地址，不能把完整的 `fact=value` 字符串伪装成投影名；
4. `proposed_events.type` 使用闭合枚举；同一候选不得包含互斥事件；
5. `outcome_kind=success` 必须具有构成目标完成的事件或状态变化，不能只有动作意图；
6. 已存在状态（例如手持茶杯）不能作为新 action event 重复提交；
7. 陪审输入候选为空时，输出必须为 `reports: []`，不得发明 `candidate_id=none`；
8. 若解析后没有 eligible candidate，系统回到候选生成或产生明确边界，不进行陪审选择；
9. 第一版不允许 event `facts` 使用自由文本；事件参数必须是 schema 字段和已有引用；
10. 陪审通过也不能覆盖规则预检失败。
