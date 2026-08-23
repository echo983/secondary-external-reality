# MVP v1.0 Phase 2 实施计划：Query Triage、认识边界与严格呈现

日期：2026-08-23  
状态：待实施  
准入审查：`MVP-canonical-epistemic-kernel-phase2-admission-review-v1.0.md`

## 1. 阶段目标

把现有固定事实查询迁移到一条统一、可审计的路径：

```text
semantic query
→ local canonical binding
→ PerceptionPolicy / AEG path decision
→ fixed WorldTruth retrieval or evidence consultation or boundary
→ native typed observation/evidence/acquisition
→ atomic commit when acquisition occurs
→ ApprovedPresentationPacket
→ deterministic/LLM renderer
```

本阶段不解析 Free facts。目标 Supported+Free 时只返回 `resolution_deferred` boundary，Phase 3 才实现 realization。

## 2. 完成定义

- 所有事实查询不再直接返回 `objectTurn.ts` 预拼文本；
- 当前感知、既有 evidence consultation、boundary 三路类型上分离；
- hidden/closed/unavailable 查询不读取或泄露目标值，且零 world commit；
- 空抽屉、空手等只由 complete scoped observation 构成；
- renderer 只能读取已批准的封闭 packet；
- canonical replay 原生读取新 envelope，旧历史继续兼容；
- 物理动作与既有 SSH 行为不回归；
- 不新增 Free fact、operator 或 MSRC。

## 3. 工作包

### P2-W1：修订规范合同

改动：

- 扩展 `src/epistemic/types.ts`：
  - `relation_set_perception`；
  - `scopeRef`、`completeness`；
  - edge 加 `acquiredAtCommitSequence`；
- 新增 `src/presentation/types.ts`：封闭 `ApprovedPresentationItem` union；
- 新增 `src/query/types.ts`：`QueryRequest`、`QueryDecision`、boundary codes；
- 扩展测试，不接运行路径。

门禁：空集合无 completeness 时不能形成 absence evidence；旧 replay 仍为 134+ 全通过。

### P2-W2：native canonical envelope 与 validator

改动：

- 在 `CommitPackage` 增加 optional versioned `canonical` envelope；
- 新增 `src/protocol/canonicalValidator.ts`；
- store append 前验证：ID 唯一、source refs、agent capability、packet items 只能引用 envelope 中批准的数据；
- legacy adapter 优先读取 native envelope，旧 commit 继续 synthetic adaptation；
- 当前生产 turn 暂不写 envelope。

门禁：恶意 packet 引用隐藏值、悬空 evidence、旧/新双写不一致均在 append 前失败。

### P2-W3：PerceptionPolicy 与 Fixed Query Triage

改动：

- 提取 `isVisible()` 为 `src/query/perceptionPolicy.ts`；
- 新增 `src/query/queryTriage.ts`；
- triage 只返回：
  - `perceive_fixed_now`；
  - `consult_acquired_evidence`；
  - `epistemic_boundary`；
  - `unsupported_boundary`；
  - `resolution_deferred`；
- binder 只能从 EntityCatalog + capability registry 产生 target。

门禁：policy 只裁决路径，不返回隐藏值；boundary 分支不调用事实 reader。

### P2-W4：零提交 boundary 与 session union

改动：

- `TurnResult` 拆为 committed/boundary discriminated union；
- boundary 含 approved packet，但无 `CommitPackage`；
- session/audit/action sequence 正确处理非提交终止；
- SSH 只呈现 packet，不显示内部 code；
- 失败 attempt 与合法 boundary audit 分开。

门禁：隐藏纸条查询返回正常 boundary response，world commit count 不变，且不记录为内部失败。

### P2-W5：迁移观察查询并 dual-write

按风险从低到高迁移：

1. inscription presence/value；
2. locate；
3. inventory；
4. inspect contents；
5. look around；
6. read/find；
7. consult acquired evidence。

每项迁移：

- 通过 triage；
- 构造 native canonical envelope；
- 为兼容暂时 dual-write 旧 evidence/epistemic fields；
- store 校验语义对应；
- commit 后从已提交 approved packet 呈现；
- 删除该查询的预拼 response 正式路径。

门禁：完成一项才迁移下一项；现有同语言输出语义保持，字符串可在专门 snapshot 中受控调整。

### P2-W6：严格 renderer

改动：

- `TurnRenderer.render(packet, languageSample)` 替代 `render(commitPackage, intent)`；
- deterministic renderer 与 Workers AI renderer 使用同一 packet；
- Workers prompt 不接触 commits、jury、explanation 或未批准 evidence；
- query renderer 失败时 deterministic fallback 仍只读 packet。

门禁：TypeScript 层无法把完整 CommitPackage 传给 renderer；capturing client 测试确认 payload 只有 packet/language。

### P2-W7：性质测试、真实历史与人测

自动验收：

- current perception 不等于 evidence consultation；
- agent A/B 隔离；
- 空集合 completeness；
- boundary zero commit/non-leakage；
- native + legacy replay；
- renderer information-flow；
- restart/replay；
- v0.9/Phase 1 全回归。

真实验收：

- 当前 `.world` 先只读 replay；
- 使用临时 LanceDB 运行中英文 SSH/semantic proposer；
- 不在用户当前 `.world` 上制造测试回合；
- 落盘 Phase 2 实施记录。

## 4. ApprovedPresentationPacket 最小合同

```ts
type ApprovedPresentationItem =
  | { kind: "observed_entities"; entityIds: string[] }
  | { kind: "bounded_relation_set"; predicate: string; objectId: string; subjectIds: string[]; complete: true }
  | { kind: "attribute_evidence"; semanticAddress: SemanticAddress; value: JsonScalar; evidenceId: string }
  | { kind: "relation_evidence"; semanticAddress: SemanticAddress; value: JsonScalar; evidenceId: string }
  | { kind: "prior_evidence"; evidenceId: string; acquiredAtCommitSequence: number }
  | { kind: "boundary"; code: PublicBoundaryCode };

interface ApprovedPresentationPacket {
  packetId: string;
  outcome: "answer" | "boundary";
  language: "zh" | "en";
  items: ApprovedPresentationItem[];
}
```

renderer 可以通过 EntityCatalog 取得已批准 entity IDs 的同语言 label；不能读取 MaterializedWorld。`prior_evidence` 必须由 packet builder 展开为已批准 player-facing value 或提供同一 packet 内受引用的 evidence item，不能让 renderer自行查询 ledger。

## 5. Boundary codes

内部稳定 code：

- `TARGET_NOT_PERCEIVABLE`；
- `CONTAINER_CLOSED`；
- `NO_ACQUIRED_EVIDENCE`；
- `UNSUPPORTED_PROJECTION`；
- `RESOLUTION_DEFERRED`；
- `AMBIGUOUS_TARGET`。

code 只用于本地模板和审计，不直接暴露给玩家。Boundary packet 不包含目标 WorldTruth value、候选值或内部 explanation。

## 6. 关键测试

1. 藏着的纸条 inscription 已存在于 WorldTruth，查询仍无法把值放进 packet；
2. 看过 inscription 后藏起，`consult_acquired_evidence` 只能报告历史 evidence，不声称当前仍相同；
3. 另一个 person 无 acquisition，不能咨询该 evidence；
4. 关闭抽屉不能生成“空”的集合 evidence；
5. 打开且完整检查的空抽屉可以生成 complete empty-set evidence；
6. 空手 inventory 同理；
7. renderer payload 不含 `newWorldCommitments`、conditions、jury、explanation、整个 ledger；
8. boundary 前后 world commit sequence 不变；
9. native envelope 被篡改时 package append 失败；
10. legacy 11 commits + native commits 重启后产生相同 views。

## 7. 停止条件

- 需要读取 query 原文才能决定固定事实值；
- 为表达 boundary 被迫写一个负 WorldTruth；
- dual-write 无法机械验证等价；
- renderer 仍需整个 CommitPackage；
- consultation 必须冒充 MemoryTrace 才能自然呈现；
- 当前 `.world` 需要迁移或重写；
- 物理动作行为因查询迁移而改变。

触发任一条件即停止当前工作包并修订设计，不进入 Phase 3。
