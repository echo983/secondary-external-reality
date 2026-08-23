# MVP v0.7 第三阶段：Action IR 影子链路

状态：完成。

## 已实现

- `WorkersAiActionIrProposer` 使用既有 Qwen candidate 工位，关闭 thinking、低温度、JSON-only，并把输出交给本地严格校验器。
- `SER_ACTION_IR_MODE=off|shadow`；默认 `off`，非法配置启动即失败。
- `shadow` 每个根回合只提议一次。提案通过 schema 校验后，以当前 LanceDB 世界和 fixture 做确定性实体绑定。
- 新增非权威 `action_proposals` LanceDB 表，保存输入/输出哈希、验证和绑定问题、模型、延迟及 usage；不保存 reasoning。
- 模型异常、恶意额外字段、绑定失败和审计存储异常均不能阻止或授权旧路径；shadow 理解到而旧路径不理解的输入仍保持零提交。

## 权限边界

提议器没有 `LanceCommitStore.append` 引用。shadow 结果不进入 candidate compiler、jury、selector 或 commit admission。唯一允许写入的是非权威审计表，因此本阶段不能改变 WorldTruth。

## 验证

完整测试共 100 项通过，新增覆盖：有效提议的持久审计与重启读取、恶意/不可用模型的隔离，以及 shadow 不能绕过旧路由。
