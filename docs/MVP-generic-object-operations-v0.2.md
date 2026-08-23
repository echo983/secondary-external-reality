# MVP 通用对象操作层 v0.2

日期：2026-08-23  
状态：已实现

## 目标

完成 v0.1 留下的两个迁移点：

1. 将纸条精确 `write/read` 从专用回合迁入通用对象操作器；
2. 为固定 seed commitments 增加可审计的版本身份。

## World Basis

每个新对象操作提交现在携带：

```json
{
  "fixtureId": "mvp-bedroom-objects",
  "fixtureVersion": "0.2.0",
  "seedHash": "SHA-256(seedCommitments)"
}
```

重放允许读取没有 basis 的旧日志；一旦日志带有 basis，活动夹具的 ID、版本或 hash 不同就拒绝继续操作，避免用另一套初始世界静默解释旧历史。

## 纸条迁移

旧流程在用户写字时创建 `note-0`。新流程使用夹具中已经存在的：

```text
blank-note-1 located_on nightstand-1
pen-1 located_on nightstand-1
```

写藏动作提交：

```text
attribute_set(blank-note-1.inscription = exact input string)
relation_ended(seed-note-location)
relation_asserted(blank-note-1 contained_by pillow-1)
```

这避免了为了满足当前输入而临时创造纸和笔。数字继续按字符串保存，前导零不丢失。

读取动作由同一个通用操作器执行，并产生：

- 纸条位置的 `relation_observed` Evidence；
- 文字内容的 `attribute_observed` Evidence；
- 对应的两条 epistemic acquisition。

会话不再导入或调用纸条专用回合；该文件已经删除。

## 兼容性

- 旧 `relation_set` 仍可重放；
- 没有 world basis 的旧提交仍可读取；
- 已有 `note-0` 纸条可以通过新查询路径读取；
- 新 basis 不匹配时在陪审和写入前失败。

## 验证

- 65 项自动测试全部通过；
- 写纸条 → 开门 → 关闭并重开 LanceDB → 读取，精确数字保持；
- 旧格式纸条提交读取通过；
- 真实 SSH → Workers AI → LanceDB：写藏 `0008642`、重启、查读成功；
- 两次真实 SSH 会话总耗时约 3.3 秒；
- 最终 Evidence 分别为 `contained_by:pillow-1` 与 `0008642`。

## 后续边界

- `write_and_hide` 仍是复合意图，下一步可拆为通用 `write`、`take/place` 组合；
- seed commitments 已有身份但仍来自版本化代码夹具，并非 LanceDB 初始化提交；
- fixture 升级目前只拒绝不匹配，尚无显式迁移器；
- 完整认识图、Query Triage 和 commitment dependency closure 继续后置。
