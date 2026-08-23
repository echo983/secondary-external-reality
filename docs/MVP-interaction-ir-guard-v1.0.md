# MVP Interaction IR Guard 报告 v1.0

日期：2026-08-23  
状态：里程碑完成，可用于下一轮人类测试

## 权限

guard 只有语言侧否决和分流权：

- 双工位一致 `action_request + actual`：允许进入旧动作链；
- 双工位一致 `world_query`：允许进入旧查询链；
- capability query、conversation、incomplete、unsupported、negated、hypothetical、conditional：机械返回零提交 interface；
- invalid、disagreed 或 model error：fail-closed，要求用户改写；
- guard 不执行 Interaction IR 中的新 operation，不绑定世界事实，不补目的地，不改变 grounding。

## 验证

- 本地完整回归：162/162；
- 真实 Workers AI guard 状态化测试：连续两轮 11/11；
- 每轮 11 条输入均产生 guard audit，且双工位全部 agreed；
- 每轮仅实际拿笔与 inventory 产生 2 个预期提交；
- canonical replay fatal issue：0。

关键修复：

```text
我能拿起笔吗
→ capability_query / non_executing
→ INTERACTION_CAPABILITY_QUERY
→ world commit delta 0
```

同时，尚未编译的 `抽屉在哪`、独立数字写入、缺 destination 的 place 和不可携带对象仍由旧链诚实拒绝；guard 没有把语言理解冒充成世界执行能力。

复现：

```sh
npm run eval:interaction-ir:guard:live
```

## 下一步

下一阶段应编写从 agreed Interaction IR 到既有 Query/Object intent 的封闭 compiler。优先开放 `locate` 和缺槽 clarification，再正式增加独立 `write` primitive contract。不能恢复依靠自然语言关键词直接执行的 fast path。
