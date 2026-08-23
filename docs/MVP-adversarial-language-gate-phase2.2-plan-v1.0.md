# MVP Phase 2.2：对抗性自然语言门禁计划 v1.0

日期：2026-08-23  
状态：执行中

## 目标

在不新增 WorldTruth 原语的前提下，证明开放自然语言入口遇到否定、假设、条件、歧义和多步失败时仍然保守、自洽、可诊断。

## 不变量

- LLM 只能提出或审查 Semantic/Action IR，不能提交世界事实；
- 否定、假设和条件未被封闭执行器明确支持时，必须零提交退出；
- 模糊代词不得靠模型猜测实体；
- 多步动作只允许已经成功的前缀成为事实，失败后缀不得提交；
- query/boundary/interface/rejected 不得伪造 WorldTruth；
- 诊断记录不得包含 token，且不是世界权威记录。

## 工作包

1. 将 Semantic IR 的阶段状态加入 live eval 行记录，区分 proposal、validation、audit、compile、execution；
2. 建立状态化 Phase 2.2 语料，覆盖否定、假设、条件、显式歧义、指代失效、关闭容器与部分成功；
3. 对每条语料检查 TurnResult、commit delta、关键回应语义和 audit stage；
4. 修复语料暴露的结构缺陷，但不靠扩大关键词白名单掩盖语义错误；
5. 门禁：本地回归全过，真实语料连续两轮全过，所有禁止输入零提交，严格 replay 零 fatal issue。

## 暂不处理

- 新房间、门外空间和开放 PlaceGraph；
- 任意文字书写；
- 任意新动作或物理原语；
- 长期记忆检索策略扩展；
- 让生成模型直接决定事实或提交。

## 完成物

- 可重复运行的 Phase 2.2 live eval；
- 阶段化失败摘要；
- 修复与两轮实测报告；
- 里程碑提交与推送。
