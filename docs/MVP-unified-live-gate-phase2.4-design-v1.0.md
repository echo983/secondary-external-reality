# MVP Phase 2.4：统一 Live Gate 设计 v1.0

日期：2026-08-23  
状态：完成

## 目标

把普通输入、对抗语言和 discourse contract 三套真实 Workers AI 评测收束为一个可重复运行的里程碑门禁，避免人工拼接局部成功结果。

## 合同

- 三套 suite 顺序执行，降低远程限流和瞬时资源争用；
- 每套 suite 仍使用独立临时 LanceDB，结束后清理；
- 聚合器只输出 suite 名、通过数、总数、准确率和 fatal replay issue 数；
- 不输出 API token、请求头、原始模型文本、用户逐条输入或详细 audit message；
- 任一 suite 非全过、JSON 无法解析、子进程异常或存在 fatal replay issue，统一门禁失败；
- 聚合结果是测试证据，不是 WorldTruth 或长期世界记忆。

## 验收

```sh
npm run eval:mvp-gate:live
```

要求连续两轮全绿，并保持本地完整回归全绿。之后再决定是否进入下一次人类探索测试。
