# MVP Interaction IR v1.0 设计

日期：2026-08-23  
状态：shadow 实验通过，尚未接入执行主链

## 目的与权限

Interaction IR 构成用户表达的言语行为，不构成世界事实。它可以提出“行动表达、世界查询、能力询问、闲聊、残句或未支持表达”，但不能输出实体 ID、能力事实、世界状态、动作结果、事件、证据或 commitment。

## 主链目标

```text
SSH protocol command
→ two independent Interaction IR workstations
→ schema/span validation
→ mechanical material consensus
→ closed routing/compiler
→ grounding/perception/jury/commit admission
```

只有 `speechAct=action_request` 且 `actuality=actual` 的一致结果有资格进入 Action IR。资格不等于授权提交。

## Schema

- `speechAct`: `action_request | world_query | capability_query | conversation | incomplete | unsupported`
- `actuality`: `actual | non_executing | negated | hypothetical | conditional`
- `clauses`: 0–4 个有序 clause
- `operation`: 封闭语言操作枚举，允许 `unknown`
- `verbSpan`: 输入原文跨度
- `roles`: `target | destination | instrument | content` 及输入原文 mention
- `queryMode`: 可选封闭查询模式

所有自由文本字段都必须是原始输入的精确连续跨度。协议拒绝未知字段。

## 双工位

两个工位独立读取相同原文并并行返回完整 IR。它们使用不同角色提示，互相看不到输出。机械 consensus 比较：语言、speech act、actuality、clause 顺序、operation、query mode 和 role/mention。`verbSpan` 只要求分别合法，不作为实质分歧，以容纳“拿起”与“拿起笔”这类等价跨度。

任一输出非法、调用失败或实质字段不同，结果都不得进入执行。初期只做旁路 live eval，不接 WorldTruth、LanceDB 或 SSH 路由。

## 迁移门禁

1. shadow corpus 覆盖真人原句、否定/条件、缺槽和多动作；
2. 连续两轮达到预定一致率，且 `我能拿起笔吗` 从未成为 actual action；
3. guard 阶段只给 Interaction IR 非行动结果否决权；
4. active 阶段才移除开放输入的 deterministic fast path；
5. 任何阶段均保留零提交失败和回滚开关。
