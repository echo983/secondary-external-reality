# MVP human round3 sequence results v0.2.0

日期：2026-08-23

## 测试方法

新增真实状态化脚手架 `runHumanRound3SequenceLiveEval.ts`。每轮创建独立临时 LanceDB，使用两个真实 Cloudflare Workers AI Interaction 工位，严格按用户给出的七句顺序运行；逐句记录响应、结果种类、interface code、提交增量、共识状态和 IR proposal，最后检查物化世界及 canonical replay。

运行命令：

```bash
npm run eval:human-round3-sequence:live
```

## 基线与修复

初次基线前六句符合预期，`走到门口` 因未知操作表达不一致而返回 `INTERACTION_UNRESOLVED`。Interaction IR 随后新增语言层 `move` 操作，但 compiler 不提供移动原语，因此稳定回答 `INTERACTION_UNSUPPORTED_OPERATION`；这表示系统听懂动作但当前世界尚不能执行。

首次修复轮为 7/7；之后连续两轮均在 `我手里有什么` 失败。原始工位输出显示，语言工位偶发把零参数 `inventory.roles` 输出成非数组，而安全工位输出空数组。Validator 现仅对 `inventory/look_around` 机械归一 `roles=[]`；有参数操作的 role schema 仍严格验证。

## 最终连续三轮逐句结果

三轮的响应、种类和提交增量完全一致：

| 输入 | 响应 | 结果 | 提交增量 |
|---|---|---|---:|
| 看看周围 | 你环顾四周，可以看到：床、纸条、门、抽屉、钥匙、床头柜、笔、枕头、桌子。 | committed | 1 |
| 笔在哪里 | 笔在床头柜上。 | committed | 1 |
| 我手里有什么 | 你手里没有拿着东西。 | committed | 1 |
| 打开门 | 你打开了门。 | committed | 1 |
| 看看门外 | 当前世界中没有你指的对象或观察范围。 | `INTERACTION_UNRESOLVED_REFERENCE` | 0 |
| 门外有什么 | 当前世界中没有你指的对象或观察范围。 | `INTERACTION_UNRESOLVED_REFERENCE` | 0 |
| 走到门口 | 这个操作还没有可执行的世界原语。 | `INTERACTION_UNSUPPORTED_OPERATION` | 0 |

每轮均为 7/7；所有 Interaction audit 均为 agreed。最终状态检查：`penLocation=nightstand-1`、`heldEntityIds=[]`、`doorOpenState=open`。三轮 fatal replay issue 均为 0。

该脚手架已加入统一真实门禁。最终统一门禁为 88/88（七套 suite），所有 suite fatal replay issue 均为 0；本地测试为 173/173。

## 边界判断

当前门外空间和移动物理原语确实尚未实现，因此后三句的零提交边界是正确行为，而不是临时故障。未来开放移动前，需要先建立空间节点、连通关系、可达性、身体姿态和移动因果条件。
