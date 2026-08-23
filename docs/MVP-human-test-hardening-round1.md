# MVP 人类测试加固第一轮

日期：2026-08-23

## 人类测试证据

首轮 SSH 测试暴露了四类问题：相同环顾输入偶发双工位分歧；`便签上有什么` 没有收束为铭文查询；写过字的纸条仍被生成式呈现称为“空白便签”；未拿起笔也能写入数字。另有库存回答“便签纸1”，需要区分历史世界状态与呈现层命名幻觉。

双工位分歧当轮零提交，证明 active fail-closed 正常。其余问题分别属于 interaction query semantics、presentation truthfulness 和 physical grounding，不应通过开放文本正则修补。

## 修复

- `write` 与旧的 `write_and_hide` 都要求笔当前满足 `held_by(self)`。只看得到笔不再等于能够使用笔。
- 无笔书写返回“你需要先拿起笔才能写字”，并保持世界零提交。
- Interaction compiler 根据 `world_query + queryMode presence/value` 机械选择铭文 presence/value 查询；不依赖模型是否恰好使用 `read` 还是 `observe` 一词。
- 协议加入 `便签上有什么` 的 read/value 示例，避免把纸条误当容器。
- `observed_entities`、`bounded_relation_set` 和 `relation_evidence` 全部使用确定性呈现。闭集事实、库存、位置不再允许生成式 renderer 添加编号、别名或状态形容词。

## 状态解释

库存中是否真的存在便签必须以 LanceDB 的 canonical relation 为准。写数字本身不移动便签；若旧 `.world` 已记录便签由 self 持有，库存应如实显示纸条，但只能使用批准名称。全新世界中，单独写字后纸条仍位于原表面。

## 回归

- 本地测试扩展至 166 项，全部通过。
- 真实 active 语料新增“未持笔书写必须失败”和原句“便签上有什么”，连续两轮 12/12，双工位一致 12/12，fatal replay issue 0。
