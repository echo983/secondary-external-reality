# 里程碑：开放 Action IR v0.7.0

状态：完成，可从默认关闭状态进入受控 shadow/active 试用。

## 达成

- 普通 SSH 与 `ttd:` 界面保持不变；
- 封闭、版本化 Action IR 与九种既有对象原语；
- 严格 JSON、字段、span、角色、literal 和边界校验；
- mention 到稳定实体 ID 的确定性绑定及能力检查；
- Workers AI proposer、独立语义审计与两个并行 reality jury；
- `off|shadow|active` 分级路由和非权威 LanceDB proposal audit；
- active 的每一步重新读取 WorldTruth，并只通过原有 candidate、selector 和 commit admission 写入；
- 显式 unsupported/not-an-action、模型失败、歧义、注入和陪审失败均不能直接产生世界事实；
- 多步 partial 保留真实历史，不伪造回滚。

## 验收证据

- 固定 20 条真实 Workers AI 语料：19/20（95%）；
- 真实 active SSH 两步状态往返：2 条连续 commit，1 条 validated Action IR audit；
- 本地自动化：108/108；v0.6 既有持久化、重放、并发 admission、纸条记忆和 SSH 测试无回归；
- token 未被跟踪。

## GWA 对齐与边界

本版本延续“提议不是事实、程序计算不是 WorldTruth、事实只由收束后的 commit 构成”的设计纲领。LLM 无 canonical ID 权限和 append 权限；binding、世界重放、revision、schema、selector 和 admission 都是本地确定性边界。

这仍不是完整 GWA：世界范围只到固定卧室实体与九类动作；自然语言条件、否定和复杂指代主要由语义审计保守拦截；陪审模型仍有波动。因而 active 默认不启用，下一阶段应先积累 shadow 分布和陪审误拒样本，再扩大原语与开放域，而不是放松现有边界。
