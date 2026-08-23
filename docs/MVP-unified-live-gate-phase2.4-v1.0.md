# MVP Phase 2.4：统一 Live Gate 报告 v1.0

日期：2026-08-23  
状态：里程碑完成

## 结果

统一真实模型门禁连续运行两轮，结果均为：

- ordinary-language：16/16；
- adversarial-language：13/13；
- discourse-contract：11/11；
- 合计：40/40；
- 三套 suite 均为 0 fatal canonical replay issue。

2026-08-23 Interaction IR guard 扩展后，统一门禁增加：

- interaction-ir-shadow：14/14；
- interaction-ir-guard：11/11；
- 新合计：65/65；
- 五套 suite 全部 gate passed，fatal replay issue 仍为 0。

本地完整回归同时保持 155/155。

## 实现

新增统一命令：

```sh
npm run eval:mvp-gate:live
```

聚合器顺序运行三个隔离 suite，避免并行远程推理造成不必要的限流与波动。每套 suite 使用临时 LanceDB 并自行清理。普通输入 suite 也补齐了 canonical diagnostic replay。

聚合输出仅包含：

- suite 名称；
- passed / total / accuracy；
- fatal replay issue 数量；
- 总门禁结果。

它不输出 token、Authorization header、逐条用户输入、模型原文、世界内容或详细 audit message。

## 判断

当前系统已经适合再次进入“小范围、引导式人类探索测试”，目的不是证明开放世界已完成，而是收集真人对现有小世界的自然表达：

- 可以自由换说法、使用口语和一次性明确指代；
- 可以测试合法动作、认识边界、否定/假设保护和部分成功；
- 遇到未开放能力应记录原始输入与公开回应，但不人工修补世界状态；
- 暂不把门外空间、任意文字写入或自由新原语列为本轮成功标准。

统一门禁表明现有测试覆盖下的权威边界稳定，但不能替代真人探索产生的新语料。
