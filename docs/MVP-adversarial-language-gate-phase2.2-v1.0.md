# MVP Phase 2.2：对抗性自然语言门禁报告 v1.0

日期：2026-08-23  
状态：里程碑完成

## 结论

开放自然语言入口在当前封闭世界中，已能保守处理否定、假设、条件、模糊代词、显式省略指代、关闭容器和多步部分成功。测试没有发现越权 world commit，规范 replay 没有 fatal issue。

## 实现

- 在确定性动作解析前增加 `UNSUPPORTED_MODIFIER`：否定、假设、条件表达不会被关键词误执行；
- Semantic IR 记录 proposal、validation、audit、compile、execution 阶段；
- Action IR 记录 proposal、validation、audit、grounding 阶段；
- 经语义验证后发生的编译或执行错误会追加诊断记录并继续向调用者暴露，不再降格成普通“无法理解”；
- 新增状态化真实模型评测命令：

```sh
npm run eval:adversarial-language:live
```

## 门禁结果

- 本地完整回归：152/152；
- 真实 Cloudflare Workers AI 对抗语料：连续两轮 13/13；
- 两轮 `fatalReplayIssues: []`；
- 所有否定、假设、条件、歧义和 boundary 输入均为零提交；
- `打开抽屉，然后打开抽屉`、`关上抽屉，然后关上抽屉`、`拿起钥匙，然后关上门` 均只保留成功前缀，并明确返回 partial；
- partial 后的查询验证了真实状态：抽屉开闭与手持钥匙均和提交日志一致。

模糊代词 `把它拿起来` 在两次模型运行中走过不同失败路径：一次 Semantic IR validation/Action IR audit，另一次 Semantic IR compile。两种路径都被阶段化记录且零提交。这说明模型输出可以波动，但权威边界和结果保持稳定。

## GWA 对齐

- 提议层的不同解释不等于世界事实；
- 编译、grounding、jury 和 commit admission 继续形成权威收缩链；
- 失败审计属于非权威 telemetry，不参与 replay；
- 部分成功以已经提交的事件前缀为准，不通过叙述回滚或补写历史；
- 认识边界与物理状态继续分离。

## 后续方向

下一阶段应从“输入不会破坏世界”转向“开放输入是否能稳定形成正确的小闭环”：扩大语义等价改写语料、引入跨回合指代的显式 discourse contract，并为真实模型评测保存不含秘密的聚合统计。仍不建议立刻增加大量物理原语。
