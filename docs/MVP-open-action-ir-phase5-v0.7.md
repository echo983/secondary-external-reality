# MVP v0.7 第五阶段：受控 active 路由

状态：完成。

## 路由

`SER_ACTION_IR_MODE` 现支持 `off|shadow|active`，默认仍为 `off`。active 模式缺少 proposer 或 semantic auditor 时拒绝构造 session。

一个根回合只调用一次 proposer。只有严格 schema、语义审计及确定性绑定全部通过的 `actions` 提案才会执行；`unsupported_action`、`not_an_action`、模型异常、歧义和能力不匹配均给出同语言保守失败并保持零提交。

## 世界权限

每一步都重新读取最新 commits、重放 MaterializedWorld、再次绑定实体，再编译为既有 `ObjectIntent`。之后完整经过 candidate 构造、确定性协议校验、双角色 reality jury、selector、commit package 和 LanceDB admission。模型输出从不成为 commit package，也不能调用 append。

多步动作按顺序提交，后一步读取前一步产生的世界；后续失败保留已经发生的真实步骤并返回 partial，不伪造原子回滚。

## 验证

完整测试 107 项通过。新增覆盖自然语言改写进入 active、三步动作逐步重放、语义拒绝及显式零步骤出口不写世界。
