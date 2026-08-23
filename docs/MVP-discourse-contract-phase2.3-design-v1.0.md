# MVP Phase 2.3：会话指代合同设计 v1.0

日期：2026-08-23  
状态：完成

## 目标

让普通用户可以在明确的小闭环中使用 `它 / it`，同时防止模型或界面层从多个候选中猜测对象。

## 合同

会话层维护两类非权威状态：

- `exposedEntityIds`：本会话中曾经通过批准 presentation 暴露的实体；
- `focusEntityIds`：上一轮批准 presentation 唯一突出的实体集合。

它们都不是 WorldTruth、Evidence、MemoryTrace 或世界提交的一部分。

解析规则：

1. 输入含批准的显式别名时，可在 `exposedEntityIds` 内解析；
2. 输入只含 `它 / it` 时，仅当上一轮 focus 恰好有一个实体才可解析；
3. 环顾、多对象清单或多候选结果不得产生单一 focus；
4. 一次输入消费旧 focus；本轮失败、interface 或无唯一 focus 的结果不会把旧 focus 无限延长；
5. 指代只产生候选 entity ID，执行前仍经过 capability、PerceptionPolicy、Query Triage 与 commit admission；
6. 不跨进程持久化，不把模型自由生成的称呼加入合同。

## 最小验收

- `钥匙在哪里` → `拿起它` 成功；
- `看看周围` → `拿起它` 因多对象而零提交拒绝；
- `纸条在哪里` → 隐藏纸条 → `它在哪里` 不得穿透隐藏边界；
- interface 插入后旧 pronoun focus 失效；
- `便签呢` 的显式别名续接保持兼容；
- 本地回归和真实状态化语料均验证提交增量与 replay。
