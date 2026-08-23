# MVP 开放 Action IR v0.7 · Phase 1 结果

日期：2026-08-23

## 完成范围

已建立纯本地、无模型和无世界写入依赖的 Action IR 安全边界：

- schema version 固定为 `0.7.0`；
- 九个既有 primitive 构成闭集；
- actor 固定为 `self`；
- role、effort、manner 均为闭集；
- 每个 primitive 有机器可读的必需角色、可选角色、grounding 类型、实体类型和能力合约；
- 根回合最多 4 步，每步最多 4 个角色；
- mention 必须是用户原文中的连续、无首尾空白片段；
- step ID 必须安全且在 envelope 内唯一；
- envelope、step、role 和 modifiers 的额外字段全部拒绝；
- JSON fence、非 JSON、未知 primitive、未知角色和畸形结构全部 fail closed；
- `write_and_hide` 的 content 在协议边界保持 1–64 位数字，前导零不被规范化。

新增显式零执行出口：

- `unsupported_action`
- `not_an_action`

这两个出口必须携带空 steps，使“砍树”等当前不支持的动作可以被正确理解和审计，而不需要伪造 primitive，也不可能进入执行链。

## 安全边界

Action IR 中没有以下字段或能力：

- canonical entity ID；
- WorldCommitment；
- StateChange；
- 成功/失败结果声明；
- LanceDB 或 session 依赖。

模型即使输出 `entityId`、`newWorldCommitments` 或 `outcome=success`，也会因未知字段被拒绝。

## 验证

- 新增 10 项 Action IR 协议与攻击性测试。
- 全量 92 项测试通过。
- 未调用 Cloudflare Workers AI。
- 未接入 session、SSH 或世界提交路径。

## 下一步

Phase 2 实现 deterministic grounding：把原文 mention 绑定为 `resolved / ambiguous / missing`，再按 primitive contract 校验实体类型和能力。只有全部必需角色精确解析后，才允许编译到现有候选路径。
