# MVP scoped perception hardening v0.2.0

日期：2026-08-23

## 触发证据

人类输入 `看看门外` 被错误降级为无范围 `look_around`，系统随后呈现了室内闭集。这没有篡改世界，但违反了查询范围不可丢失的认识论约束。

同轮审计确认 `human-round2.lancedb` 已包含上一 SSH 会话的拿笔、拿钥匙提交，因此开局库存不是状态幻觉。新的测试轮必须使用从未出现过的数据路径。

## 修复

- Interaction 工位必须保留 scoped perception 的完整 source-grounded target。
- `look_around` 仅表示真正无范围的当前环境环顾；`看看门外` 和 `门外有什么` 必须表示 `observe(target=门外)`。
- Active compiler 只用精确实体别名绑定执行对象，不再允许包含匹配把 `门外` 缩成 `门`。
- 显式目标不在世界词典时返回 `INTERACTION_UNRESOLVED_REFERENCE`，世界零提交。
- 宽松别名匹配仍可服务旧话语辅助，但不再拥有 active execution binding 权力。
- 首次 invalid、disagreed 或 model error 时，完整的两个独立工位共同重采样一次；第二次仍未一致则 fail closed。任何单工位结果都不能进入 compiler。
- 项目版本由 `0.1.0` 升至 `0.2.0`。

## 验证

- `看看门外` 与 `门外有什么` 已加入真实 Workers AI active 门禁。
- 修正省略目标提示后，active 语料连续两轮 14/14，双工位一致 14/14，fatal replay issue 0。
- 本地测试 168/168；统一真实门禁 79/79，六套语料 fatal replay issue 均为 0。

## 仍未开放

门外空间和一般移动原语仍未建模。`走到门前`、`走到门口` 不应提交；后续应先设计空间、连通性、姿态与移动前置条件，再开放这些动作。
