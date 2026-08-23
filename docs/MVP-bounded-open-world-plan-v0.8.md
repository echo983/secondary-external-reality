# MVP 有界开放世界内核计划 v0.8

日期：2026-08-23  
前置里程碑：`mvp-open-action-ir-v0.7.0`

## 目标

把固定动作演示推进为可供人类探索的受控场景：用户能观察周围、查询容器、定位已可见实体和检查持有物；实体目录与感知规则可扩展；所有回答仍由 MaterializedWorld 构成，LLM 不生成隐藏事实。

## 阶段

1. 通用观察：`look_around / inspect_contents / locate / inventory`，建立可见性闭包和认识证据。
2. 可扩展目录：fixture 暴露稳定实体描述、别名、能力和位置，不在 grounder/turn 中写对象专用句法。
3. 最小空间感知：表面与当前持有可见；开放容器内容可见；关闭容器与枕头下内容不泄露。
4. Affordance：从实体类型、属性和当前状态确定可尝试动作，供帮助与拒绝使用。
5. 人测界面：`help / look / inventory / where <object>`，同语言、可诊断的失败反馈。
6. 验收：本地不变量、真实 Workers AI、真实 SSH 探索脚本、文档、tag 和推送。

## 本里程碑边界

v0.8 开放读取与探索，不开放任意实体生成。`move_to / enter / leave` 及第二场景留给 v0.9：当前 fixture 尚无可靠房间拓扑，提前加入只会把文字标签误当空间模型。场景种子协议在观察与 affordance 稳定后实施。

## Go / No-Go

- 关闭容器内容和未读取 inscription 零泄露；
- 所有观察事实可追溯至 seed 或 commit replay；
- 查询不产生物理 state change；
- 新观察原语经过 Action IR schema、semantic audit、grounding、jury 和 admission；
- v0.7 全量回归无退化；
- 首次用户仅凭 `help` 能完成不少于八回合探索；
- secret 和 reasoning 不进入 Git、审计或玩家输出。
