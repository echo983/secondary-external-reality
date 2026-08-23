# Phase 2.1 普通人输入自测：Live Eval Round 1

日期：2026-08-23  
环境：真实 Cloudflare Workers AI，独立临时 LanceDB，测试结束自动清理  
模型：项目当前 candidate / semantic / renderer 配置

## 1. 方法

生成 16 条普通用户可能输入的文本，覆盖：口语、错字、省略指代、中英文、闲聊、残句、未开放能力、关闭容器、物理上无法绑定的请求与主体查询。

每条同时检查：

- TurnResult 类别；
- world commit 增量；
- 玩家回应；
- 失败是否错误改变世界。

同一语料连续运行两次，以区分稳定缺陷与远程推理瞬时不稳定。可复现命令：

```sh
npm run eval:human-input:live
```

## 2. 结果

- 第一轮：11/16，68.75%；
- 第二轮：12/16，75%；
- 两轮均无非法 world commit、无 hidden-value leakage；
- boundary、interface、SelfQuery、可引用别名和普通物体动作主干稳定。

稳定通过的代表输入：

- `我随便瞅瞅这屋里都有啥`；
- `我在哪里`；
- `我在床上吗`；
- `便签呢`；
- `在便签上随便写个 hello`（准确 capability boundary）；
- `把`（incomplete fragment）；
- `我看看门外头有什么`（unsupported world scope）；
- `顺手把那支笔拿起来吧`；
- `我现在手上都拿了啥呀`；
- `抽屉里头现在都有啥`（closed boundary）；
- `把我的影子折起来塞进抽屉`（零提交拒绝）。

## 3. 稳定缺陷

### A. 闲聊分类过窄

`你好呀` 未命中只接受精确 greeting 的 deterministic classifier，进入 LLM 后被判为 not-an-action。应将语气词和常见标点纳入 conversation normalization，而不是扩大 WorldTruth 能力。

### B. 书写 capability classifier 抢占疑问句

`纸纸条上到底写没写东西` 被“包含纸条与写、但无数字”的规则误判成任意文字写入。需要先做 question/act 分类，不能用关键词存在性代替言语行为判断。

### C. `打开看看` 合成意图错误

`劳驾把抽屉打开看看` 被 deterministic parser 归为 `open_and_observe`，而该旧原语错误要求另一个 portable observable target，最终报 `No observable object matched.`。正确结构应是对同一 container 的有序 `open → inspect_contents`，或明确只执行 open，不能复用“打开容器并观察另一个对象”的合同。

由于 C 未打开抽屉，后续 `所以抽屉里面究竟有什么东西` 合法返回 closed boundary；它不是第四个独立根因。

## 4. 瞬时不稳定

`Where exactly did I leave the key?` 第一轮被宽泛 fallback 拒绝，第二轮成功。单独诊断时：

- Semantic IR proposal valid；
- semantic audit pass；
- compiler 正确生成 `query.location / locate / key-1`。

说明失败发生在端到端路径的某个被宽泛 catch 隐藏的瞬时环节。应保留阶段化 failure telemetry，避免把模型/API/commit/renderer 的不同错误统一显示为“无法理解”。Cloudflare 测试采用远程 REST 推理并允许瞬时重试；本次没有修改模型或平台配置。

## 5. 修复优先级

1. 将 input classification 从关键词规则提升为 closed speech-act precedence；
2. 重构同一容器的 `open_and_inspect` 合成动作合同；
3. 收窄 Semantic fallback catch，记录 proposer/auditor/compiler/commit/renderer stage code；
4. 扩展 conversation normalization；
5. 修复后复跑同一 corpus，门禁建议为两次连续 16/16，且非法输入始终零提交。

这些问题属于输入分类与组合动作编译，不要求扩大 WorldTruth、任意文字原语或 PlaceGraph。
