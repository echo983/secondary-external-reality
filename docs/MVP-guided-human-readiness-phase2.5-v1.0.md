# MVP Phase 2.5：引导式人类测试就绪报告 v1.0

日期：2026-08-23  
状态：完成，可开始人类探索 Round 2

## 加固内容

- 每个 SSH shell 创建独立 `BedroomSession`，临时 discourse focus 不再跨连接共享；
- 所有 shell 继续共享同一个明确指定的世界 LanceDB；
- 服务器级 world queue 串行处理不同连接的回合，避免并发会话基于同一旧序号同时准备提交；
- IR 未准入、非动作、unsupported action、compile 或 grounding 拒绝会写入非权威 `TurnAttempt`，保留本地原始输入与阶段码，world commit 仍为零；
- SSH welcome/help 已说明自然语言、一次性 `它`、否定/假设保护和当前未开放范围；
- 提供独立数据路径的 Round 2 测试操作文档，避免覆盖既有世界。

## 验证

- 本地完整回归：155/155；
- 改动后统一真实 Workers AI 门禁：40/40；
- ordinary / adversarial / discourse 三套 suite 的 fatal replay issue 均为 0；
- secret 文件未加入版本控制，聚合输出不包含 token 或详细模型原文。

## 边界

“可人类测试”表示当前小世界的权威闭环足以接受探索性输入，不表示任意自然语言、开放空间或任意物理动作已经实现。真人发现的新失败应先进入语料和结构诊断，再决定修复或声明 capability boundary。

操作说明见 `MVP-guided-human-exploration-round2.md`。
