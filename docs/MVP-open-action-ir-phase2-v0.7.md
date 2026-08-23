# MVP 开放 Action IR v0.7 · Phase 2 结果

日期：2026-08-23

已实现确定性 grounding 和现有对象候选路径适配：

- entity mention 只依据版本化 fixture names 绑定 canonical ID；
- 输出明确区分 `resolved / ambiguous / missing / literal`；
- 未知引用、歧义引用和能力不匹配使用不同稳定问题代码；
- primitive contract 的 entity type 与 capability 在 grounding 时执行；
- literal content 不参与实体检索；
- `unsupported_action` 和 `not_an_action` 保持零步骤、零编译；
- compiler 只接受完全 grounded 的步骤；
- compiled intent 与 canonical IDs 可进入既有对象候选路径，最终仍经过 v0.6 world commit admission。

验证覆盖精确绑定、同名歧义、未知对象、角色能力不匹配、精确 literal 和真实 LanceDB 对象提交。全量 97 项测试通过。

本阶段仍未把 Action IR 接入 session；现有 SSH 行为不变。
