# Secondary External Reality：完整现状与上下文交接

日期：2026-08-23  
用途：上下文压缩后的权威工程交接快照  
分支：`main`  
生成前远端 HEAD：`1e88d1f docs: plan canonical epistemic kernel phase 2`

## 1. 项目目的

项目要提供一个普通 SSH 界面。使用者登录后看到：

```text
ttd:
```

`ttd` 表示 try to do：输入是主体意识发出的尝试指令，不是对结果的宣告。服务器端世界根据已经存在的世界事实、身体/空间条件、因果规则和观察能力，返回可信的“第二外部现实回应”，使用与输入相同的语言。

例如“我下床去开门”可能成功，也可能因腿麻等身体反馈部分失败。LLM 可以理解自然语言、提出候选、审计可信性和呈现结果，但不拥有 WorldTruth 提交权。

长期系统可能极大，因此工程策略始终是：先建立很窄但真实闭合的 MVP，再逐层开放。

## 2. 总体设计原则

项目以 GWA（Generative World Architecture）为纲，但 MVP 不声称严格或完整实现。

核心纪律：

- 开放表达，封闭因果原语；
- 开放提案，不开放提交权；
- World Kernel 决定什么是真的；
- Observation 决定什么成为证据；
- Presentation 决定如何表达，不能反向构成世界事实；
- query 决定在哪里揭示，不能决定潜在过去是什么；
- Free 世界语义投影一旦被实际解析，就必须原子固定；
- 已固定历史只能由后续合法事件推进，不能静默改写；
- WorldTruth、Evidence、Agent Epistemic Graph 必须分开；
- 被感知不等于被记住，遗忘不能释放世界事实；
- LLM 陪审适合语义和经验判断，不能替代确定性一致性验证。

关键 GWA 原文和本项目研究：

- `docs/GWA-v0.3a-dual-layer.txt`
- `docs/GWA-v0.3a-P1-P6c-FROZEN-total-patch.txt`
- `docs/GWA-Core-v0.3b-CMWF-1-formal-consensus.md.docx`
- `docs/GWA-countersignature-patch-v0.3b-CMWF1.docx`
- `docs/GWA-larger-architecture-study-after-v0.9.md`

## 3. 已完成里程碑

### v0.6 世界基础加固

Tag：`mvp-world-foundation-v0.6.0`

- LanceDB append-only `world_commits`；
- seed/basis/hash 与重放；
- 封闭 entity/attribute/relation schema；
- 提交前 future-world 试应用；
- state change 与 entity attribute commitment 单一语义桥；
- 跨进程文件锁与 expected world sequence；
- event/evidence/epistemic 引用完整性；
- LLM 无 append 权。

### v0.7 Open Action IR

Tag：`mvp-open-action-ir-v0.7.0`

- LLM 提出受限 Action IR；
- 严格 schema/source-span validation；
- semantic auditor；
- deterministic entity grounding；
- world-causality 与 experience-epistemic 双角色陪审；
- `off | shadow | active` 三种模式；
- 最终仍编译到封闭本地动作能力。

### v0.8 Bounded Open World

Tag：`mvp-bounded-open-world-v0.8.0`

- `look_around`、`inventory`、`inspect_contents`、`locate`；
- 从 seed + commits 重放 MaterializedWorld；
- 隐藏物、关闭容器和 inscription 不泄露；
- entity catalog 与 state-derived affordances；
- 观察产生 event/evidence/epistemic change。

### v0.9 Open Semantic IR

Tag：`mvp-open-semantic-ir-v0.9.0`，commit `3279588`。

- LLM 开放地提出 query/perception 的语义；
- 本地 compiler 独占 executable intent 生成权；
- semantic proposal 非权威审计；
- inscription presence 与 exact value 分离；
- 中英文自然改写和相邻重复 CJK 修复；
- 真实 SSH 验证过写藏 `001739`、隐藏不泄露、找到后精确恢复。

### v1.0 Phase 1：规范类型与兼容重放

状态：完成，实施记录 `docs/MVP-canonical-epistemic-kernel-phase1-v1.0.md`。

相关 commits：

- `a71a1e6` SemanticAddress 与规范类型；
- `f64a7c5` legacy canonical adapter；
- `125c17e` commitment/evidence/epistemic views；
- `772db13` LanceDB read-only canonical replay；
- `b61de65` epistemic agent 能力约束；
- `76f68d0` Phase 1 实施记录。

已实现：

- 规范 `SemanticAddress`；
- 长期 `ProjectionCommitment` 等类型合同；
- legacy commits 确定性、无写入适配；
- `CommitmentGraphView`；
- `EvidenceLedgerView`；
- `AgentEpistemicGraphView`；
- strict/diagnostic canonical replay；
- `LanceCommitStore.replayCanonicalViews()`；
- 当前 MVP 仅 `person` 具有 EpistemicAgent 能力；
- 旧记录不伪造 operator、MSRC 或 dependency certificate。

重要：这些 view 当前仅用于 replay/审计，尚未接入玩家事实查询路径。

## 4. 当前验证状态

最近完整验证环境：

- Node：`v20.19.2`；
- 自动测试：134/134；
- TypeScript strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`；
- `npm test` 包含 build。

当前真实 `.world/world.lancedb` 的只读验收：

- tables：`action_proposals`、`turn_attempts`、`world_commits`；
- world table version：11；
- world commits：11，sequence 0–10；
- canonical observations：33；
- canonical evidence：33；
- epistemic edges：33；
- legacy fixed projections：0；
- strict canonical replay issues：0；
- 连续两次 replay 结果一致；
- replay 前后 table names/version/row count/package-hash aggregate 完全相同。

真实世界数据和 secret 均被 `.gitignore` 排除，没有进入 Git。

## 5. 当前代码结构

### 权威世界和提交

- `src/protocol/types.ts`：现有 v0.x CommitPackage/候选协议；
- `src/protocol/validator.ts`：候选封闭验证；
- `src/protocol/commit.ts`：准备 immutable commit package；
- `src/storage/lanceCommitStore.ts`：LanceDB、writer lock、预提交试应用、只读 canonical replay；
- `src/world/materializedWorld.ts`：seed + world commitments 的权威物化；
- `src/world/worldSchema.ts`：MVP 封闭 schema。

### v1 规范 replay

- `src/world/semanticAddress.ts`
- `src/world/commitmentTypes.ts`
- `src/world/commitmentGraph.ts`
- `src/epistemic/types.ts`
- `src/epistemic/evidenceLedger.ts`
- `src/epistemic/agentGraph.ts`
- `src/replay/legacyCanonicalAdapter.ts`
- `src/replay/canonicalReplay.ts`

### 输入理解

- `src/actionIr/*`：v0.7 Action IR；
- `src/semanticIr/*`：v0.9 Open Semantic IR；
- `src/world/objectIntent.ts`：封闭对象意图；
- `src/world/entityCatalog.ts`：实体名称/能力绑定。

### 回合与呈现

- `src/turn/bedroomSession.ts`：序列、审计和路由；
- `src/turn/objectTurn.ts`：当前对象动作与事实查询；
- `src/turn/bedroomTurn.ts`：早期 stand→move→open 纵切面；
- `src/ai/bedroomAdapters.ts`：双陪审与 Workers AI renderer；
- `src/ssh/server.ts`、`src/ssh/textShell.ts`：SSH 界面。

## 6. 当前玩家能力

SSH `help` 暴露的大致能力：

- look / 环顾；
- inventory / 查看手中物品；
- 查询对象位置；
- 查询打开容器内容；
- 打开/关闭；
- 拿起；
- 放到表面或容器；
- 查看 inscription 是否存在或精确值；
- 写数字、藏纸条、稍后找到并读取；
- 用“然后”连接多动作。

当前事实查询仍主要在 `objectTurn.ts` 中从 MaterializedWorld 读取并预拼自然语言。它们会生成旧式 evidence/epistemic change，但尚未由新 AEG 决定玩家能否回答。

## 7. Cloudflare Workers AI

当前模型：

```text
candidate / semantic / renderer: @cf/qwen/qwen3-30b-a3b-fp8
jury:                           @cf/mistralai/mistral-small-3.1-24b-instruct
```

Cloudflare account ID 当前默认：`00f6c85f82f6297c8c0bef9460e013d9`。

Token 默认从 `secret/cftoken.txt` 读取。绝不能输出、提交或复制 token 内容。`secret/` 已 git ignored。

历史 benchmark 文档位于：

- `docs/Workers-AI-model-benchmark-round-1.md`
- `docs/Workers-AI-model-benchmark-round-2.md`
- `docs/Workers-AI-model-benchmark-round-3.md`
- `docs/Workers-AI-model-benchmark-round-4-protocol.md`
- `docs/Workers-AI-model-benchmark-jury-round-1.md`

## 8. SSH 运行信息

标准命令：

```sh
npm run build
SER_SSH_HOST_KEY_PATH=secret/ssh_host_ed25519_key \
SER_SSH_PASSWORD_FILE=secret/ssh_password \
SER_ACTION_IR_MODE=active \
npm run start:ssh
```

连接：

```sh
ssh ttd@127.0.0.1 -p 2222
```

默认只绑定 `127.0.0.1`。如果出现 `EADDRINUSE`，先只读检查已有监听进程，或显式使用其他端口，例如 `SER_SSH_PORT=2223`；不能因此假定世界或 Node 已损坏。

用户曾在缺失 host key 和端口占用错误后看到 shell 输出 `Segmentation fault`。当前 Node v20.19.2 下 build/test 稳定通过；尚未把该 shell 级现象认定为项目代码缺陷。不要为此执行破坏性环境操作。

## 9. v1.0 大设计

设计与审查：

- `docs/MVP-canonical-epistemic-kernel-plan-v1.0.md`
- `docs/MVP-canonical-epistemic-kernel-design-review-v1.0.md`

目标是 Canonical Commitment & Epistemic Kernel：

- stable SemanticAddress；
- Supported+Free / Supported+Fixed；
- commitment roots/dependencies/exposure provenance；
- Query Triage；
- typed Observation/Evidence/Acquisition；
- Agent Epistemic Graph；
- ApprovedPresentationPacket；
- Stable Realizer 和最小 MSRC；
- query confluence、closure integrity、epistemic non-leakage。

纵向探针规划为纸条的潜在 `fiber_mark`，但它属于 Phase 3，当前绝未实现。

## 10. 当前下一阶段：Phase 2

Phase 2 文档已在 commit `1e88d1f` 推送：

- `docs/MVP-canonical-epistemic-kernel-phase2-admission-review-v1.0.md`
- `docs/MVP-canonical-epistemic-kernel-phase2-plan-v1.0.md`

目标：把**固定事实查询**迁移到：

```text
canonical binding
→ PerceptionPolicy / AEG path
→ fixed retrieval | evidence consultation | boundary
→ native typed records
→ commit（若产生 acquisition）
→ ApprovedPresentationPacket
→ renderer
```

Phase 2 审查发现的 P0：

1. 当前 typed Observation 不能表达“完整检查后的空集合”；
2. `objectTurn.ts` 查询绕过 renderer，预拼 response；
3. boundary 目前是异常/失败 attempt，缺少合法零提交结果；
4. EpistemicEdge 缺 acquisition sequence，无法排序先后证据。

Phase 2 工作包：

1. P2-W1：修订规范合同；
2. P2-W2：native canonical envelope 与 validator；
3. P2-W3：PerceptionPolicy 与 Fixed Query Triage；
4. P2-W4：零提交 boundary/session union；
5. P2-W5：逐项迁移事实查询并 dual-write；
6. P2-W6：renderer 只接 approved packet；
7. P2-W7：性质测试、临时世界人测、阶段报告。

### 压缩后应从这里继续

从 **P2-W1** 开始，不应直接改 `objectTurn.ts`：

- 为 typed Observation 增加 scoped complete relation-set observation；
- 为 EpistemicEdge 增加 `acquiredAtCommitSequence`；
- 定义封闭 ApprovedPresentationPacket item union；
- 定义 QueryRequest/QueryDecision/boundary codes；
- 只做合同和测试，运行路径保持不变；
- 门禁通过后再进入 P2-W2。

## 11. 尚未实现，禁止误判为现状

- Phase 2 的 Query Triage 尚未接入；
- 当前玩家回答尚未由 AEG 统一约束；
- native canonical envelope 尚未写入 commits；
- strict ApprovedPresentationPacket renderer 尚未实现；
- 合法零提交 boundary 尚未实现；
- Stable Realizer 尚未实现；
- Supported+Free `fiber_mark` 尚未实现；
- MSRC 只存在设计，没有 production closure solver；
- exposure receipt/outbox 尚未实现；
- MemoryTrace、遗忘、误忆、Recollection 尚未实现；
- PlaceGraph、多房间移动、NPC 证言和社会关系尚未实现；
- 完整 Explanation Refactoring/Anomaly Debt 尚未实现；
- 分布式共识与公网 SSH 部署尚未实现。

## 12. 安全和工作纪律

- 绝不提交 `secret/`、`.world/`、`dist/`、`node_modules/`；
- 不打印 token、SSH password、玩家 evidence value 或真实世界全文；
- 对真实 `.world` 的架构验收优先只读；测试使用临时 LanceDB；
- 不重写已有 world commits 或 package hash；
- 不用 LLM 修补非法世界；
- 不把 query 原文、语言、turn sequence 或 narrative utility 放入未来 realizer；
- 不用 jury 否决后重采样确定性世界值；
- 发现设计门禁失败时停止当前工作包并修订设计，不扩大范围掩盖问题。

## 13. Git 状态与提交线

生成本快照前：

- `main` 与 `origin/main` 同步在 `1e88d1f`；
- Phase 2 审查/计划已推送；
- 最近里程碑 tag 仍为 `mvp-open-semantic-ir-v0.9.0`；
- v1.0 尚未打 tag，因为只完成 Phase 1，Phase 2 尚未实施。

本文件应作为独立提交推送。压缩后先运行：

```sh
git status --short
git log -3 --oneline --decorate
npm test
```

确认干净、测试通过后，从 P2-W1 连续推进。
