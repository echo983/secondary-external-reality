# MVP v0.8 有界开放世界内核实现记录

## 世界读取

新增 `look_around / inspect_contents / locate / inventory`。它们从 seed 加 commits 重放出的 MaterializedWorld 计算结果，观察 commit 可以携带事件、observation、evidence 和 epistemic change，但没有物理 state change 或新世界承诺。

最小可见性闭包：场景顶层实体、表面上的实体和主体持有物可见；`contained_by` 仅在容器打开时可见；枕头下纸条和 inscription 不会被环顾泄露。查询空容器和空手仍提交“观察到空”的体验事件，使结果有历史身份而不伪造物理变化。

## 扩展边界

`EntityCatalog` 从 fixture seed 与 names 构造稳定目录，不依赖卧室专用解析代码。`availableAffordances` 根据实体属性、开闭和当前位置给出当前动作集合。v0.8 Action IR schema 升为 `0.8.0`，增加四个观察原语及严格角色合约。

## 人测界面

SSH 支持 `help / 帮助 / ?`，以及 `look`、`inventory`、自然语言位置和容器查询。常见关闭、不可见与歧义错误给出可行动的同语言反馈；其他内部错误仍不泄露。

## 本地验证

封闭内核候选完全由本地 world replay 与 compiler 构成，因此使用身份绑定的确定性陪审；只有含未决现实判断的候选才进入双 LLM 陪审。这样避免让已经确定的 WorldTruth 读取和机械状态变化重新随机化。确定性 parser 作为 fast path，Action IR active 处理它不理解的自然改写；shadow 仍可全量采样。

114 项测试通过，包括隐藏信息不泄露、容器开闭、提交后内容变化、持有物、位置、实体目录、affordance、陪审分流与 help。
