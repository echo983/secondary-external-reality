# MVP Interaction IR active v1.0

日期：2026-08-23

## 结论

Interaction IR 已从只读 shadow / guard 进入受限 active。开放自然语言不再依赖增加 `if` 或正则分支：两个独立 Workers AI 工位先生成封闭、来源跨度受检的 Interaction IR；只有物质语义一致后，机械编译器才把它映射到既有世界原语。

LLM 仍没有世界写权限。它不能声明实体 ID、能力、状态、结果、证据或 commitment。实体绑定由 `ReferenceLexicon` 完成，物理能力与当前状态由 object grounding 和原有 commit admission 判断，最终事实只来自规范提交与重放。

## active 路由

1. 两工位并行解释 speech act、actuality、ordered clauses 和 source-grounded roles。
2. schema validation 与 mechanical consensus 任一步失败，零提交并请求改写。
3. conversation、capability、incomplete、unsupported、negated、hypothetical、conditional 均零提交。
4. actual action / world query 进入确定性 compiler。
5. compiler 只做操作映射、角色槽完整性、词典绑定和数字 literal 检查。
6. 编译后的原语逐步重放当前世界并进入既有 jury、commit、evidence、presentation 路径。

缺失目标、缺失去向、歧义指代、非法 literal 和尚无原语都有稳定的 interface code。系统不补猜省略信息。

## 本里程碑新增

- `locate` 能回答 `part_of` 结构位置，例如抽屉是床头柜的一部分。
- 独立 `write` 原语写入 1–64 位数字，不隐含藏匿或移动。
- `我向空白便签写2236` 可执行；随后 `纸条上写着什么` 能从规范证据读回 `2236`。
- `那我写2236` 请求明确目标；`我放下笔` 请求明确去向。
- `我拿起桌子` 在语言层是合法 action request，但由世界能力约束拒绝。
- SSH 环境变量开放 `SER_INTERACTION_IR_MODE=active`。

## 验证

- 本地：165 项测试全部通过（加入 active compiler/session 覆盖后）。
- 真实 Workers AI active 状态语料：首次 9/10，唯一失败为 read/value 双工位不一致，安全地零提交。
- 将 read/value 写入协议示例后，连续两轮 10/10；每轮 10/10 双工位一致、4 个规范提交、fatal replay issue 为 0。

首轮失败保留为重要证据：语言一致性不足时 active 路由确实 fail closed，没有回退到旧开放文本正则或让单一模型获得执行权。

## 尚未开放

- 代词与跨轮省略的 Interaction IR discourse binding。
- 任意文本书写。
- 动态实体创建与开放世界 affordance 注册。
- 对能力询问给出基于当前世界的可信回答。

这些应继续通过协议、grounding 与可审计世界能力扩展，而不是回到自然语言 switch 封堵。
