# Secondary External Reality 里程碑现状评估

版本：`mvp-world-foundation-v0.6.0`  
日期：2026-08-23

## 里程碑结论

项目已经完成“可信小世界基础”的第一个可复现里程碑：普通 SSH 用户能够通过 `ttd:` 提出行动尝试，服务器结合确定性世界规则和真实 Cloudflare Workers AI 给出同语言现实反馈；已经发生的世界变化可持久化、重放、审计和恢复。

当前系统足以进入下一阶段：**开放自然语言理解 → 受限 Action IR**。它还不允许 LLM 直接生成或写入任意 WorldTruth。

## 当前可用能力

- 普通 SSH 接入、密码认证、`ttd:` 交互提示符。
- 中文和英文输入及同语言自然反馈。
- Cloudflare Workers AI 模型调用、超时、有限重试和响应兼容处理。
- 条件化候选、有限域投影解析、协议校验、陪审报告及确定性 Pareto 收束。
- LanceDB 追加式 `world_commits` 权威日志。
- 实体、类型属性、时态关系、事件、证据和认识变化。
- 打开、关闭、拿取、放置、放入、观察、写下并隐藏、寻找及读取等对象动作。
- 显式多步骤动作；后续步骤失败时保留已经提交的现实。
- 精确纸条文字记忆，支持无关行动及进程重启后的恢复。
- 根回合和步骤审计；失败尝试不进入 WorldTruth。
- 权威提交成功而审计缺失时的幂等自修复。

## 世界基础加固状态

所有新世界提交必须经过统一准入门：

1. 核对候选准备时看到的全局世界序号。
2. 核对 world basis、fixture 版本和实际 seed hash。
3. 从权威历史重放当前世界。
4. 校验封闭 MVP schema、实体引用、属性值域、关系谓词和端点能力。
5. 要求 projection `stateChanges` 与实体 `attribute_set` 承诺一致，并核对旧值。
6. 检查 event、evidence、epistemic 引用和全局身份唯一性。
7. 在未来世界副本完整试应用候选增量。
8. 只有试应用成功才追加 LanceDB。

同机不同 Node 进程通过文件系统 writer lock 串行化提交。实际竞争测试证明，同一世界序号只能由一个进程成功占用。

## GWA 对齐判断

- I1 HardConsistency：在当前封闭 schema 和小世界内较强。
- I3 QueryIndependence：已提交事实和 fixture 潜在值局部成立。
- I4 ProjectiveConsistency：有限域投影内成立。
- I5 CommitmentMonotonicity：追加历史、失败隔离、禁止投影换值。
- I6 CounterfactualStability：当前版本化 fixture 内成立。
- I7 MinimalCommitment：已有数量成本和确定性收束，尚未实现真正 MSRC 依赖闭包。
- T1 CommitBeforeExpose：成立。
- T2 AtomicCommit：当前单机 LanceDB 部署边界内成立。
- T3/T4：已有结构基础，但仍需随开放输入继续强化。

这不是完整 GWA 实现；它是保持 GWA 方向且足够支撑下一轮实验的 MVP 内核。

## 验证基线

- TypeScript 构建通过。
- 82 项自动测试全部通过。
- 真实 SSH + Workers AI 卧室链通过：主体最终为 `standing / doorway`，门为 `open`。
- 真实 SSH + Workers AI 对象三步链通过：连续 3 次提交，钥匙最终 `held_by self`，门为 `open`。
- 跨两个独立 Node 进程的同序号竞争测试通过。
- fixture 当前版本为 `0.3.0`。

## 已知边界

- 世界 ontology 仍是卧室 MVP 的封闭集合，不是开放实体宇宙。
- 当前生产链只有一个保守 LLM 陪审角色，不是两个独立验证工位。
- 尚未实现 GWA I2 解释可接受性与冲突证据解释层。
- 尚未实现通用未知投影的查询路径独立固定机制。
- 最小承诺成本仍未计算实体、因果和认识依赖闭包。
- writer lock 是单机文件系统协调，不是跨主机分布式共识。
- fixture `0.2.0` 数据不会被静默加载为 `0.3.0`；正式迁移工具尚未提供。

## 下一阶段准入原则

下一阶段允许 LLM：

- 识别开放表达中的动作、参与实体、修饰条件和目标；
- 生成封闭、版本化的 Action IR 提案；
- 提出无法解析的实体引用和需要补充观察的条件。

下一阶段仍禁止 LLM：

- 创造 schema 外的实体类型、属性、谓词或因果原语；
- 绕过确定性前置条件和未来世界试应用；
- 直接调用 LanceDB 世界提交；
- 将自然语言断言直接转化为 WorldTruth。

推荐下一里程碑目标：实现开放自然语言到受限 Action IR 的生成、双角色验证和保守失败闭环，同时保持当前提交门完全不变。
