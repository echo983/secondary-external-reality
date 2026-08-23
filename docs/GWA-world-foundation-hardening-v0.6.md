# GWA 世界基础加固 v0.6 结果

日期：2026-08-23

## 已完成

### 提交前世界试应用

LanceDB 追加前先从权威历史和版本化 seed 重放当前世界，再把整个候选提交应用到未来世界副本。任何 schema、引用、位置唯一性、包含环或能力错误都会在持久化前拒绝，数据库保持不变。

### 封闭 MVP schema

新增实体类型、类型属性、属性值域和关系谓词注册表。关系必须同时引用存在的 subject 与 object，并校验 `held_by`、`located_on`、`contained_by` 的端点能力。事件、证据和认识变化也必须引用存在的实体、事件和证据。

### 单一状态语义

实体投影 `stateChanges` 不再能独立成为另一套现实：每条变化必须有同实体、同属性、同新值的 `attribute_set` 承诺，并且 `from` 必须匹配提交前权威实体值。卧室姿势、位置和门状态已迁入这条规则，仍保留 `stateChanges` 作为因果与呈现视图。

对象 fixture 升级为 `0.3.0`，seed 正式包含主体初始姿势和位置。旧 basis 与新提交冲突时拒绝，不静默迁移。

### 单写者与提交时重检

提交包记录 `expectedWorldCommitSequence`。文件系统原子 writer lock 包围“读取最新提交—核对预期序号—世界试应用—LanceDB 追加”，同机不同 Node 进程不能同时占用下一个序号。异常退出留下的锁仅在 owner PID 已不存在，或无效锁超过安全时间后回收。

同时增加全局 event/evidence ID 唯一性、已固定投影不可换值、world basis 与实际 seed hash 一致性检查。

## 验证

- 82 项自动测试全部通过。
- 真实跨两个 Node 进程竞争同一序号：一个成功，一个在提交前失败。
- 真实 SSH + Cloudflare Workers AI 卧室动作：提交后统一物化为 `standing / doorway / door=open`。
- 真实 SSH + Cloudflare Workers AI 对象三步链：3 个连续提交，钥匙最终为 `held_by self`，门为 `open`，全部 basis 为 `0.3.0`。

## 仍保留的诚实边界

- writer lock 是当前单机 LanceDB 部署边界，不宣称分布式共识协议。
- 尚未实现 GWA I2 解释可接受性、通用未知投影的 I3/I6、真正的 MSRC 依赖闭包。
- 双 LLM 验证工位尚未进入生产提交链；当前仍是一个保守陪审角色。
- 因此下一阶段可以开放自然语言到受限 Action IR，但仍不得允许 LLM 直接生成任意 WorldTruth。
