# MVP v1.0 Phase 2.1：Human-facing Semantic Closure 设计

日期：2026-08-23  
状态：实施中

## 1. 背景

Phase 2 首轮人测证明 WorldTruth、固定事实查询和认识边界主干可以工作，同时暴露了人类界面的结构断点：renderer 把 `TARGET_NOT_PERCEIVABLE` 改写成问句；系统输出“便签”但 binder 只认识“纸条”；主体自身查询被错误地送入普通实体可见性；闲聊、残句、能力边界和真正理解失败共用近似错误文案。

这些不是 Free fact 或更多物理原语能解决的问题。本阶段在进入 Stable Realizer 之前，建立“系统说得出，用户就指得回；系统不能知道，就不能被 renderer 说成知道”的人类语义闭环。

## 2. 核心不变量

1. Presentation 不得改变 QueryDecision 的认识论类别。
2. boundary、exact value、否定和 prior evidence 属于高风险呈现，必须保留确定性语义骨架。
3. 系统输出的实体称呼必须来自与 binder 共享的 ReferenceLexicon。
4. `self` 不是普通可见物体；主体状态查询必须走 SelfQuery。
5. conversation、fragment、unsupported capability、ambiguous reference 是合法零提交界面结果，不是世界失败。
6. DiscourseContext 只保存已向该会话暴露的引用，不属于 WorldTruth、Evidence 或 MemoryTrace。
7. 指代上下文不得绕过 PerceptionPolicy 或 AEG。

## 3. 分层设计

```text
raw input
→ input classification / Semantic IR
→ canonical binding + discourse candidates
→ SelfQuery | Fixed Query Triage | closed action
→ committed acquisition | evidence consultation | boundary | interface-only result
→ ApprovedPresentationPacket
→ risk-aware deterministic/LLM presentation
→ exposed references update DiscourseContext
```

### 3.1 ReferenceLexicon

每个实体提供 canonical zh/en label 与允许输入 aliases。EntityCatalog、deterministic renderer、LLM packet expansion 和 binder 读取同一份注册表。LLM 不直接选择实体名称；若输出未批准别名，presentation conformance 失败并回退。

### 3.2 Presentation risk policy

- boundary：完全确定性；
- prior evidence：确定性地包含取得时序与“非当前事实”限定；
- exact inscription：确定性保真；
- scoped negative：确定性保留 scope/completeness；
- 低风险正向枚举：可由 LLM 润色，但失败即确定性回退。

### 3.3 SelfQuery

封闭支持 `position`、`posture` 与明确存在的主体关系。`self.position=bedside` 可回答“我在哪里”；`self.posture=sitting_on_bed_edge` 可回答姿势。对于“我在床上吗”，只有明确的 canonical relation 或足以构成该命题的规则才可回答是/否；否则返回部分已知信息加认识边界。

### 3.4 Interface-only outcome

TurnResult 扩展合法零提交类别：conversation、incomplete fragment、unsupported capability、ambiguous reference。它们写 attempt audit，但不写 world commit，且不伪装为 action failure。

### 3.5 DiscourseContext

会话内保存最近已暴露实体 ID、批准 label 与来源 packet ID。只允许解析到候选；最终查询仍重新经过 capability 和 perception/epistemic triage。MVP 先不跨进程持久化，不宣称“记忆”。

## 4. 工作包

1. P2.1-W1：确定性 boundary 与高风险 presentation conformance；
2. P2.1-W2：ReferenceLexicon 单一来源与 round-trip tests；
3. P2.1-W3：SelfQuery contracts、binder、packet 与回答；
4. P2.1-W4：interface-only result 分类与 attempt audit；
5. P2.1-W5：DiscourseContext 与省略指代；
6. P2.1-W6：人测语料、性质测试、实施报告。

## 5. 停止条件

- 为回答 self query 被迫从叙事常识猜关系；
- renderer 必须读取 MaterializedWorld 才能完成 packet；
- 为支持指代需要把语言上下文写进 WorldTruth；
- 未暴露实体可借 discourse context 穿透隐藏边界；
- 任意文本写入或门外空间被当作本阶段修复前提。

触发停止条件时应保留诚实 boundary，并把能力扩张留给后续阶段。
