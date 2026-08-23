# MVP Interaction IR 持久化 Shadow 报告 v1.0

日期：2026-08-23  
状态：里程碑完成

## 实现

- 新增独立 LanceDB 表 `interaction_ir_audits`；
- 每条记录包含输入哈希、双工位输出哈希与验证摘要、material consensus proposal、模型/延迟/usage 摘要及旧路由最终类别；
- 审计表不属于 WorldTruth、Evidence、TurnAttempt 或 canonical replay；
- `BedroomSession` 在旧路由执行的同时启动两个 Interaction IR 工位，最终并列记录结果；
- shadow 模型、consensus 或 telemetry 失败均被隔离，不能阻止或授权旧执行；
- SSH 新增 `SER_INTERACTION_IR_MODE=off|shadow`，默认 off。

## 验证

- 本地完整回归：161/161；
- 真实 Workers AI + 临时 LanceDB 状态化测试：连续两轮 8/8；
- 每轮 8 条输入生成 8 条持久化 Interaction audit；
- 每轮旧世界只产生 2 个预期提交；
- canonical replay fatal issue：0。

关键对照被准确保存：

```text
输入：我能拿起笔吗
Interaction IR：capability_query / non_executing
旧路由：committed
```

这证明 shadow 捕获了真实言语行为缺陷，同时没有暗中改变旧世界。

复现：

```sh
npm run eval:interaction-ir:persistent-shadow:live
```

## 下一步边界

guard 阶段只能否决执行，不能用 Interaction IR 创造新动作。建议首先处理双工位一致的 `capability_query`、`conversation`、`incomplete` 以及非 actual 表达；world query 和 actual action 仍交给旧执行/查询链，直到各自 compiler 完成。
