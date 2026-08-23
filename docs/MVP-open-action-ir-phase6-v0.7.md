# MVP v0.7 第六阶段：固定语料与实机验收

状态：完成。

## 固定语料

代码内冻结 20 条案例：中文与英文、九种原语、多步骤、unsupported、非动作和 prompt injection。评价比较 exit、primitive、角色语义及 fixture canonical entity；允许 `key` / `the key` 这类仍能确定性绑定为同一实体的原文 span，不以表面字符串次序制造假错误。数字 content 仍要求逐字相同。

真实 Qwen proposer 最终结果为 19/20，即 95%，达到预先写入 v0.7 计划的门槛。20 条均未出现 schema 外字段或 canonical ID；唯一偏差是注入型非动作被归为 `unsupported_action` 而非 `not_an_action`，两者均是经 schema 验证的零步骤出口，不能进入 grounding/compiler/commit。

本轮 proposer 单次观察延迟为 0.339–1.538 秒；单例总 token 为 552–656，Workers AI usage 中 neurons 为约 3.20–6.19。这里只记录 API 返回的实测 usage，不把它换算为可能变化的货币价格。

## 真实 active SSH

临时本地标准 SSH server、真实 Workers AI、双角色 reality jury 和临时 LanceDB 完整运行：

- 输入：`我打开抽屉，然后把抽屉关上`；
- 获得两次 `ttd:` prompt；
- Action IR 审计为 `validated`；
- 顺序提交 `object-open-0`、`object-close-1` 两个世界 commit；
- 返回：`你打开了抽屉。你关上了抽屉。`。

另一次三步实测在第一步开抽屉提交后，双陪审保守拒绝取钥匙，系统返回 partial 并保留且仅保留已经发生的一条 commit。这是 fail-closed/partial 语义的真实验证，不纳入 proposer 95% 解析准确率。

## 本地回归与保密

- `npm test`：108/108 通过；
- `secret/cftoken.txt` 仍由 `.gitignore` 排除；
- 评估输出与审计只含模型名、hash、延迟和 usage，不含 token 或 reasoning；
- live 命令使用临时 SSH key、密码和 LanceDB，结束后清理。
