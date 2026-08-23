# MVP 纸条持久记忆纵向切片 v0.1

日期：2026-08-23

## 验收目标

```text
写下一个精确数字并把纸条放到枕头下
→ 执行其他世界动作
→ 关闭并重新打开 LanceDB
→ 查找并读取纸条
→ 数字逐字一致
```

测试值使用 `001739`，以证明存储的是字符串事实而不是会丢失前导零的数值近似。

## 权威表示

一次成功的写藏动作提交三类封闭世界承诺：

```json
{"kind":"entity_created","entityId":"note-0","entityType":"paper_note"}
{"kind":"attribute_set","entityId":"note-0","attribute":"inscription","value":"001739"}
{"kind":"relation_set","subjectId":"note-0","predicate":"contained_by","objectId":"pillow-1"}
```

协议验证器拒绝未知 commitment kind、缺字段和空字段。LLM 可以审查候选，但不能改变文字内容、实体 ID 或容器关系。自然语言回应也不是读取来源。

## 恢复与读取

`MaterializedWorld` 按 `commit_sequence` 重放 LanceDB 的 `world_commits`：

1. 重建 `note-0` 实体；
2. 恢复精确的 `inscription` 属性；
3. 恢复 `note-0 contained_by pillow-1` 关系；
4. 查找时精确匹配关系，再读取实体属性。

枕头下没有可读纸条时明确失败；存在多张可读纸条时也拒绝擅自选择。

## 验证结果

- 55 项自动测试全部通过；
- 自动恢复回归：写纸条 → 开门 → 重启存储 → 读纸条，返回 `001739`；
- 真实 Workers AI 回归：两次 Mistral 审查、重启恢复、两条提交，约 6.11 秒；
- 真实标准 SSH 回归：写藏 `008642` → 查读，约 6.33 秒，提交包中的属性值逐字一致。

## 当前边界

- 只接受 1～64 位 ASCII 数字；
- 写藏动作的纸笔可用性和执行成功仍来自固定小世界投影；
- 尚未实现移动、损坏、修改或销毁纸条；
- 同一枕头下多张纸条会返回歧义，而不是自动挑选；
- 实体和关系当前按需在内存物化，权威来源仍是 LanceDB 单表提交日志；
- “其他事情”目前只由已实现的动作域覆盖，不代表任意自然语言动作已经可执行。
