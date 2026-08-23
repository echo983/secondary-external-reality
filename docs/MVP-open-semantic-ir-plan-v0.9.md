# MVP 开放语义 IR 与能力编译器计划 v0.9

执行状态：完成；验收见 `MILESTONE-open-semantic-ir-v0.9.0.md`。

## 目标与边界

自然语言先进入开放语义层，模型表达动作、感知、查询、引用、query mode 及否定/假设/条件；模型不能输出 ID、类型、能力、事实、结果、状态变化或 commit。严格 source-span 校验和独立忠实性审计之后，本地 Capability Compiler 才能生成封闭 ObjectIntent。

v0.9 首批开放能力聚焦 query/perceive：inscription presence/value、location、contents、inventory 和 entity observation。任意 act 仍由 v0.8 Action IR fallback 或确定性 fast path处理；未注册语义零执行。

## 阶段

1. Semantic IR 0.9.0 类型、严格 validator 和攻击边界；
2. 引用绑定、Capability Registry 与 Executable Intent；
3. inscription presence/value 垂直切片；
4. 安全 NFKC 与相邻重复 CJK 字修复；
5. Workers AI proposer + 独立 semantic auditor；
6. 非权威 proposal audit、真实语料和 SSH 纸条闭环。

## 不变量

- 开放语义不能构造 canonical ID 或 WorldCommitment；
- negated/hypothetical/conditional 不可编译；
- capability 未注册不可寻找“最接近”执行；
- inscription 由 replayed attribute 获得，空串与精确值严格区分；
- 不可见纸条不泄露 presence/value；
- 规范化记录修复，不做开放拼写猜测。
