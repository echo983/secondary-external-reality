# 里程碑：有界开放世界内核 v0.8.0

状态：完成，适合下一轮人工 SSH 探索测试。

## 达成

- Action IR schema `0.8.0`，13 个封闭原语；
- `look_around / inspect_contents / locate / inventory`；
- 从 MaterializedWorld 派生的最小可见性闭包；
- 关闭容器与枕头下内容不泄露，inscription 只由 read 获得；
- 观察事件、证据与认识变化可持久化，但没有伪造物理 state change；
- fixture 驱动的 EntityCatalog 和当前状态 affordance；
- 确定性 fast path 与开放自然语言 Action IR fallback；
- 封闭机械候选使用确定性陪审，未决现实候选保留双 LLM 陪审；
- SSH `help` 和可行动的关闭/不可见/歧义反馈。

## 验收

- 本地：114/114；
- 真实 Qwen Action IR：27/28（96.4%）；唯一实质偏差为英文 `inspect table` 分类，能力 grounding 会安全拒绝；
- 真实 SSH + Workers AI + LanceDB：help 后连续完成环顾、开抽屉、查空、拿钥匙、查手持、定位、放入、再查内容；
- 10 次 prompt、8 条连续 commit，最终抽屉内容为钥匙；
- token 仍在 ignored `secret/`，输出与 Git 中无 secret/reasoning。

## 设计判断

v0.8 开放的是探索和世界读取，不是任意世界创造。LLM 负责闭集意图提议与获准事实的语言表达；可见性、位置、容器内容、能力、候选和提交仍由确定性内核构成。这延续 GWA 的“计算不是事实、提议不是承诺、commit 才构成 WorldTruth”。

## 下一边界

尚未实现房间拓扑、`move_to / enter / leave`、第二场景和 WorldSeedProposal。它们应作为 v0.9 的空间与场景种子里程碑；不得在普通玩家回合中让模型按需要即时创造实体。
