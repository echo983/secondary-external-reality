# Phase 2.1 普通人输入自测：Live Eval Round 2

日期：2026-08-23  
环境：真实 Cloudflare Workers AI、独立临时 LanceDB（每轮自动清理）  
结论：里程碑通过

## 结果

- 本地完整回归：151/151；
- 修复后的真实语料：连续两轮 16/16（100%）；
- boundary、interface 与拒绝输入均保持零 world commit；
- 评测除结果类别和 commit 增量外，开始对关键自然语言回应做语义断言，避免“错误回答但类型正确”的假阳性。

## 本轮结构性修复

1. 言语行为优先：存在性疑问（如“写没写东西”）先于任意文字写入 capability boundary；相邻重复字仍只做确定性修复。
2. 同一容器复合意图：新增内部 `open_and_inspect`，在一个规范提交中先打开容器，再形成完整、有界的 contents observation；它不再借用需要点名 portable target 的 `open_and_observe`。
3. 高置信自然语言入口：口语化环顾、手中物品查询和 `Where did I leave…` 进入封闭确定性路由，LLM 不参与已能机械判定的语义。
4. 阶段诊断：Semantic IR audit 增加 proposal、validation、audit、compile、execution 阶段。模型前置失败可安全回退；已经验证后的编译或执行错误不再被伪装成“无法理解”。
5. 闲聊归一化：常见中文语气词和英文 `there` 被识别为 interface conversation，始终零提交。

## GWA / 权威边界

- LLM 仍只提出或审查语义，不直接写入 WorldTruth；
- `open_and_inspect` 的状态变化、观察范围、证据和回应均由封闭执行器构造；
- 空容器结论来自完整关系集合观察，不来自模型猜测；
- 会话指代只引用已经暴露的实体，并在执行时重新检查可感知性；
- 所有失败路径继续服从“未通过提交准入即不改变世界”。

## 下一步建议

保持当前 16 条语料为最低回归门槛，进入 Phase 2.2：扩展更具对抗性的多轮人类表达（否定、条件、代词歧义、动作部分成功），并让阶段化诊断进入可汇总的 eval 输出。暂不扩充 WorldTruth 原语集合。
