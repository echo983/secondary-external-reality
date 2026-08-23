# MVP LanceDB 持久化 v0.1

状态：已实现第一阶段提交日志

## 决策

MVP 使用 LanceDB `0.37.1`。`world_commits` 单表追加日志是权威事实源；一次世界提交的事件、状态变化、观察、世界承诺和 revision guard 整体存入同一行。

不直接用多个表共同承担一次原子提交。原因是实体、关系、事件分别写入时可能出现部分成功，而当前 LanceDB TypeScript API 的安全原子边界是单次表写入，不是传统关系数据库式跨表事务。

## 提交行

```text
commit_id
turn_id
commit_sequence
selected_candidate_id
expected_projection_revisions_json
resolved_projections_json
events_json
state_changes_json
observations_json
new_world_commitments_json
package_json
package_hash
created_at
```

`package_json` 保存完整 commit package，其他 JSON 列用于后续查询和物化。`package_hash` 为 SHA-256，用于幂等重试和冲突检测。

## 写入规则

- `commit_sequence` 必须全局连续；
- 同一 `turn_id + commit_sequence` 和相同 hash 的重试返回 `existing`；
- 同一身份但内容不同，抛出 `CommitConflictError`；
- 单进程内所有 append 串行执行；
- 写入后重新读取并确认 hash；
- 进程在“写入成功、响应失败”之间崩溃时，重试可通过 hash 恢复为成功；
- 任何失败不会写入第二张权威表，因此不存在跨表半提交。

## 实体和关系视图

后续的 `entities`、`relations`、`events` 表是 `world_commits` 的物化视图：

```text
world_commits
  → 按 commit_sequence 重放
  → entities / relations / events / epistemic views
```

物化失败不改变世界事实。恢复时从最后成功物化序列继续，或从提交日志完整重建。

纸条记忆切片已经实现首个内存物化器：它按序重放 `entity_created`、`attribute_set` 和 `relation_set` 三类封闭承诺，恢复实体属性与关系。它证明了视图可由提交日志重建，但尚未写成独立 LanceDB 物化表。

向量和 embedding 也属于可重建索引，不拥有 WorldTruth 权限。

## 当前限制

- 写入串行化只覆盖单 Node.js 进程；
- 尚未实现多进程/多节点写入租约；
- 尚未物化实体与关系视图；
- 尚未实现日志压缩、快照和校验点；
- 读取当前为 MVP 全表扫描，数据增长后需要标量索引和有界查询；
- `created_at` 是存储审计时间，不是世界内时间。

SSH MVP 初期应保持单写入进程。扩展为多实例之前，必须增加唯一 writer lease 或外部一致性协调层。
