# MVP 通用对象操作层 v0.1

日期：2026-08-23  
状态：核心闭环已实现

## 已实现

- 数据驱动的卧室对象夹具：实体、名称、能力属性和初始关系；
- 时态关系承诺：`relation_asserted` 与 `relation_ended`；
- 从 `world_commits` 与固定 seed commitments 重建当前实体、属性和关系；
- 单一直接位置约束与容器循环检测；
- 通用 `take`、`place`、`put_inside`、`open`、`close`、`observe`；
- 复合 `open_and_observe`，用于“打开抽屉找钥匙”；
- 关闭容器阻止直接取出或观察内部物体；
- 结构化 `evidenceGenerated` 与 `epistemicChanges`，并验证事件来源；
- 确定性中英文意图模式和按能力进行的实体角色绑定；
- 所有操作继续经过协议验证、Mistral 陪审、revision guard 和 LanceDB 原子提交。

## 权威状态变化示例

钥匙从桌面进入手中：

```text
relation_ended(seed-key-location)
relation_asserted(key-1-location-0, key-1 held_by self)
```

钥匙从手中进入抽屉：

```text
relation_ended(key-1-location-0)
relation_asserted(key-1-location-2, key-1 contained_by drawer-1)
```

物化视图只显示后一条有效关系；旧位置仍保留在追加日志中。

## Evidence 边界

“打开抽屉找钥匙”在同一候选中产生：

1. 打开抽屉的成功事件；
2. `open_state=open` 的世界承诺；
3. 查找钥匙的观察事件；
4. 指向该观察事件的 `relation_observed` Evidence；
5. 主体取得该 Evidence 的 epistemic change。

renderer 可读取批准后的 Evidence，但没有权力决定钥匙位置。

## 验证结果

- 63 项自动测试全部通过；
- 重启恢复后，钥匙仍在关闭的抽屉中；
- 未打开抽屉时，取出和观察均被拒绝且不追加提交；
- 打开抽屉后可以找到钥匙；
- 笔使用同一个操作器完成“从床头柜拿起→放到桌上”，没有新增专用回合；
- 真实标准 SSH + Workers AI 完成五步钥匙流程，重启前后共 5 条提交，约 18.6 秒；
- 最终状态：`key-1 contained_by drawer-1`、`drawer-1.open_state=open`；
- 最终 Evidence 来源：`event-observe-key-1-4`。

## 实验中修正的问题

Mistral 首次把 `drawer=closed` 前置条件和 `drawer=open` 后置承诺误判为矛盾。陪审协议现已明确：conditions 属于 PRE-STATE，事件发生后 state changes/commitments 属于 POST-STATE。修正后相同候选通过真实审查。

## 尚未完成

- `write/read` 的精确文字语义仍由纸条适配器承载，尚未完全并入通用操作器；
- `remove_from` 当前复用 `take` 的执行语义，没有独立的规范化操作种类；
- 固定 seed commitments 来自版本化夹具，尚未作为世界初始化提交写入 LanceDB；
- 名称解析仍是有限模式，不处理代词、复杂修饰和上下文指代；
- 没有完整 Agent Epistemic Graph、Query Triage 或 Commitment Closure。

以上两项已在 [v0.2](MVP-generic-object-operations-v0.2.md) 完成。
