# 里程碑：开放语义 IR v0.9.0

状态：完成。

## 架构

```text
natural language
→ Open Semantic IR 0.9.0
→ strict source-span validator
→ independent semantic fidelity audit
→ deterministic entity binding
→ Capability Compiler
→ closed ObjectIntent
→ kernel candidate / jury routing / admission
→ WorldTruth
```

模型只提出用户意图。`ExecutableIntentV09` 只能由本地 compiler 产生；adapter 不持有 LanceDB append。成功 semantic proposal 进入非权威 audit，保存 hash、schema、issues、usage 和安全规范化记录，不保存 token/reasoning。

## 新能力

- `inspect_inscription_presence`：空白回答“没有字”，非空只回答存在；
- `inspect_inscription_value`：返回已提交的精确字符串；
- query location/contents/inventory 与 perceive entity 的开放表达编译；
- NFKC 和相邻重复 CJK 字修复，例如 `纸纸条 → 纸条`；
- `help` 暴露 inscription 查询。

## 验收

- 本地测试：118/118；
- 真实 Qwen semantic proposer + 独立 auditor + compiler：12/12；
- 真实 SSH：开放问法确认空白纸条，写藏 `001739`，环顾不泄露纸条，隐藏状态直接查询被拒，实际查找读取精确恢复 `001739`；
- 7 次 prompt、4 条连续 commit、1 条 validated 非权威 semantic audit；
- v0.8 回归无退化，secret 保持 ignored。

## GWA 对齐

开放的是语言意义空间，不是事实构成空间。语义理解、审计意见和规范化都是可丢弃计算；实体、属性、可见性和最终事实仍由重放世界与收束 commit 构成。LLM 一致意见不能覆盖 capability、前置条件或 admission。

## 下一步

v1.0 应把 semantic `act` 的能力注册从旧 Action IR 平滑迁移，并加入稳定失败代码审计；随后才进入房间拓扑、移动与受控 WorldSeedProposal。
