# Secondary External Reality：完整现状与上下文交接

日期：2026-08-23
用途：上下文压缩、主代理续接和多子任务协同的权威工程快照
分支：`main`
记录基线：`5f32981 fix: ground spatial placement semantics`（本交接更新将在其后提交）
包版本：`secondary-external-reality@0.2.0`

## 1. 一句话现状

这是一个已可真人 SSH 测试的有界卧室世界：开放自然语言先由两个并行 LLM 工位构成受限 Interaction IR，只有通过严格验证和机械共识后，才由本地实体绑定、世界能力、认识边界、陪审和 append-only 提交链决定是否发生。当前本地测试 177/177，真实 Workers AI 统一门禁 96/96，canonical replay fatal issue 为 0。

它不是开放世界。门外空间与一般移动仍明确未建模。

## 2. 用户目标与产品语义

用户通过普通 SSH 连接，看到 `ttd:`。`ttd` 表示 try to do：输入是主体意识的尝试，而不是宣告结果。世界可能让动作成功、失败或只成功一部分，并返回同语言的可信“第二外部现实回应”。

长期方向可能很庞大，因此始终采用最小闭环策略：先让少量实体、关系、动作、观察和记忆真正自洽，再逐层开放语言、空间和原语。

## 3. GWA 纲领与不可破坏的不变量

本项目以 GWA 为纲，但 MVP 不声称严格完整实现。核心纪律：

- 开放表达，封闭因果原语；
- 开放提案，不开放提交权；
- Interaction/Action/Semantic IR 是非权威解释，不是 WorldTruth；
- LLM 不得直接声明实体 ID、能力、状态、成功、证据或 commitment；
- WorldTruth、Evidence、Agent Epistemic Graph、Presentation、Discourse Context 分层；
- query 只能揭示，不得决定或改写潜在事实；
- presentation 只能表达 approved packet，不得反向构成事实；
- 关闭容器、隐藏对象和未观察 inscription 不得泄露；
- 已提交历史只能被后续合法事件推进，不能静默改写；
- 部分成功以已提交前缀为真，不以叙述回滚；
- invalid、模型失败或双工位分歧必须 fail closed；
- 真人失败输入先进入语料和结构诊断，不以自然语言 switch/if 无限制封堵。

GWA 原文和项目研究入口见 [INDEX.md](INDEX.md)。

## 4. 已完成的架构阶段

### 世界与持久化基础（v0.1–v0.6）

- LanceDB append-only `world_commits`；
- seed/world basis/hash 与确定性重放；
- 封闭 entity/attribute/relation schema；
- candidate validation、future-world 试应用和 commit admission；
- state change 与 entity attribute commitment 语义桥；
- expected sequence、进程内队列与跨进程 writer lock；
- `turn_attempts` 与崩溃后 success audit 修复；
- 纸条数字在无关动作和进程重启后仍可精确找回。

### 开放语言但封闭执行（v0.7–v0.9）

- Action IR：严格 schema/source span、semantic audit、确定性 grounding、双现实陪审；
- Bounded Open World：环顾、库存、位置、容器内容与 visibility；
- Semantic IR：开放 query/perception 语义，本地 capability compiler 独占 executable intent；
- 支持 `off | shadow | active` 的旧 Action IR 路由。

### Canonical Commitment & Epistemic Kernel（v1.0 Phase 1–2）

- stable SemanticAddress；
- canonical commitment/evidence/acquisition 类型；
- legacy-compatible strict/diagnostic replay；
- CommitmentGraph、EvidenceLedger、AgentEpistemicGraph；
- QueryRequest / QueryDecision / PerceptionPolicy / Query Triage；
- complete scoped relation-set observation，可表达“确实检查后为空”；
- boundary、prior evidence consultation 和 committed observation 分离；
- ApprovedPresentationPacket 与 risk-aware renderer；
- canonical/legacy dual-write 等价验证；
- self position/posture query 与共享 ReferenceLexicon。

### 人类语义闭环与门禁（Phase 2.1–2.5）

- 闲聊、残句、unsupported scope/capability 成为合法零提交 interface；
- 否定、假设、条件在确定性动作前被保护；
- 会话内唯一焦点 `它 / it`，执行前仍重新经过 perception/grounding；
- 多连接独立 discourse session，共享世界提交串行；
- ordinary、adversarial、discourse 的真实模型门禁统一聚合。

### Interaction IR（当前开放输入主链）

- 两个独立 Workers AI 工位：`linguist` 与 `safety_analyst`；
- speech act、actuality、ordered clauses、operation、source-grounded roles；
- 严格 validator，未知字段和非原文 mention 拒绝；
- 两工位完整重采样至多一次，绝不接受单工位结果；
- mechanical material consensus；
- `shadow | guard | active` 及独立 `interaction_ir_audits`；
- active compiler 只负责封闭操作映射、槽位完整性、引用绑定和 literal 检查；
- world query 与 actual action 才能继续，其余均零提交。

### 最近真人测试加固（v0.2.0）

- scoped perception 不可丢失：`门外` 不能缩成 `门`，也不能降级为室内环顾；
- `look_around` / `inventory` 的非权威多余 roles 机械清除；
- `move` 可被语言层理解，但 compiler 明确返回 unsupported primitive；
- `抽屉里`、`床上` 被解析为实体 + 空间关系；
- 放置按目的实体能力生成 `contained_by` 或 `located_on`；
- `place` / `put_inside` 仅在共识比较中视为同一放置词汇族；
- bare imperative 与 capability query 明确区分；
- SSH ANSI CSI 方向键序列不再污染 ttd 输入。

## 5. 当前权威运行链

```text
SSH input
→ per-session BedroomSession + global world serialization
→ two Interaction IR workstations in parallel
→ schema/source-span validation
→ mechanical material consensus
→ deterministic Interaction compiler
→ ReferenceLexicon exact/spatial binding
→ replayed MaterializedWorld capability + state checks
→ candidate validation / jury / selection / commit preparation
→ LanceDB append admission
→ canonical observation/evidence/acquisition
→ ApprovedPresentationPacket / bounded renderer
```

注意：代码仍保留历史 Action IR、Semantic IR 和 deterministic fast path，用于兼容、测试和非 Interaction 模式。SSH 推荐同时设置 `SER_INTERACTION_IR_MODE=active` 与 `SER_ACTION_IR_MODE=active`；开放输入的首要构成层是 Interaction IR。

## 6. 当前世界、实体与能力

卧室 fixture 的核心实体包括：`self`、床、纸条、门、抽屉、钥匙、床头柜、笔、枕头、桌子。权威位置通过时间化关系表达，例如：

- `held_by(object, self)`；
- `located_on(object, surface)`；
- `contained_by(object, container)`；
- `part_of(drawer, nightstand)`。

玩家当前可尝试：

- 环顾、库存、位置、容器内容、纸条 inscription；
- 打开/关闭门或容器；
- 拿起 portable 对象；
- 放入 open container 或放到 surface/bed；
- 写 1–64 位数字、藏纸条、寻找和读取；
- 用“然后”连接动作；
- 在严格条件下用上一轮唯一 focus 的 `它 / it`。

当前明确边界：

- 门外/走廊/其他房间没有 PlaceGraph 节点；
- `move` 没有世界原语；
- 任意文字 inscription 未开放；
- 动态实体和动态 affordance 注册未开放；
- capability query 能被正确识别，但可信回答尚未接入；
- discourse context 不持久化，不等于长期记忆；
- Supported+Free Stable Realizer、MSRC、MemoryTrace、NPC/社会证言尚未实现。

## 7. 当前测试事实

最近完整验证（2026-08-23）：

- `npm test`：177/177；
- Interaction imperative 单句真实双工位：12/12；
- placement 状态序列真实模型连续三轮：24/24；
- 统一真实门禁：8 suites、96/96；
- 每个 suite canonical replay fatal issue：0；
- placement 最终状态：`key-1 located_on bed-1`，手持集合为空。

统一 suites：

1. ordinary-language 16/16；
2. adversarial-language 13/13；
3. discourse-contract 11/11；
4. interaction-ir-shadow 14/14；
5. interaction-ir-guard 11/11；
6. interaction-ir-active 16/16；
7. human-round3-sequence 7/7；
8. placement-failure-sequence 8/8。

```sh
npm test
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt npm run eval:mvp-gate:live
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt npm run eval:human-round3-sequence:live
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt npm run eval:placement-failures:live
```

真实门禁会消耗 Workers AI 配额；并行运行多个 live suite 可能造成限流，不建议子任务各自重复跑总门禁。

## 8. Cloudflare Workers AI 与秘密

当前模型：

```text
candidate / Interaction / Semantic / renderer: @cf/qwen/qwen3-30b-a3b-fp8
jury:                                       @cf/mistralai/mistral-small-3.1-24b-instruct
```

token 默认从 `secret/cftoken.txt` 读取。禁止读取后输出、复制到文档、提交或进入测试快照。`.gitignore` 已排除 `secret/`、`.world/`、`dist/`、`node_modules/` 和 `coverage/`。

## 9. 代码所有权地图

- `src/ssh/`：协议壳、认证、输入字节处理；
- `src/turn/bedroomSession.ts`：最关键的路由与审计编排点；
- `src/turn/objectTurn.ts`：对象动作、查询和 commitment 候选；
- `src/interactionIr/`：当前自然语言主构成层；
- `src/actionIr/`、`src/semanticIr/`：历史/兼容 IR 与独立能力；
- `src/world/`：fixture、schema、物化、实体目录、词典与投影；
- `src/protocol/`：validator/evaluator/selector/commit admission；
- `src/query/`：PerceptionPolicy 和 Query Triage；
- `src/epistemic/`：EvidenceLedger / AEG；
- `src/presentation/`：approved packet renderer；
- `src/storage/lanceCommitStore.ts`：LanceDB 表、append/lock/recovery；
- `src/replay/`：canonical replay；
- `src/eval/`：真实模型脚手架；
- `test/`：本地回归。

高冲突文件是 `bedroomSession.ts`、`objectTurn.ts`、`lanceCommitStore.ts`、`objectFixture.ts`、`package.json`。多子任务不要同时修改这些文件。

## 10. 建议的下一阶段

从结构上，下一主里程碑应是“最小空间与移动纵切面”，而不是继续增加自然语言特判。目标可限定为床边与门口两个 position/Place 节点：

1. 先写设计：Place/position 身份、邻接/可达性、门状态、主体 posture/position、观察 scope；
2. 定义 `move` primitive contract、前置条件、事件和 commitment；
3. 让 `走到门口` 真正提交 position change；
4. 仍不开放门外，`看看门外` 继续是合法 boundary，直到门外成为正式 Place；
5. 增加状态化本地测试、真实双工位 sequence 和 canonical replay 门禁；
6. 真人验证后再考虑 doorway → hall 的第二个空间扩展。

不要在设计 PlaceGraph 前直接让 `看看门外` 返回 LLM 想象内容。

## 11. 子任务协同建议

可并行但应避免共享文件写冲突：

- 子任务 A（只读设计）：审计 GWA 空间/连续性原则，产出 `docs/MVP-minimal-space-movement-design-v0.3.md`，不改运行代码；
- 子任务 B（测试设计）：在独立新文件中设计 move/space corpus 和断言，暂不改 `runMvpLiveGate.ts`；
- 子任务 C（代码审计）：检查 position/posture、door、visibility 与 relation schema 的复用点，输出建议，不改核心文件；
- 主任务：整合设计后独占修改 fixture/schema/session/object turn，并统一跑测试。

协同纪律：

- 每个子任务先读本文件、README 和 `docs/INDEX.md`；
- 明确文件所有权，避免同时编辑高冲突文件；
- 子任务不得自行提交/推送，除非主代理明确授权；
- live Workers AI 总门禁由主任务集中执行；
- 新失败记录原始输入、公开响应、commit delta 和 replay 结果；
- 不用秘密文件、真实 `.world` 或 `dist` 作为协作产物。

## 12. 启动与排障

推荐完整命令见根 README。常见问题：

- `ENOENT secret/ssh_host_ed25519_key`：先生成 host key；
- `EADDRINUSE 127.0.0.1:2222`：只读定位监听进程或改用新端口；
- host identification changed：执行 `ssh-keygen -f "$HOME/.ssh/known_hosts" -R '[127.0.0.1]:2222'`；
- 旧数据路径出现意外初始库存：换全新 `SER_DATA_PATH`，不要把持久状态误判成幻觉；
- 双工位偶发不一致：系统应零提交。先抓两份 validated IR 的物质差异，再判断是否是安全机械等价；不要盲目增加重试或放宽单工位执行。

## 13. 压缩后恢复顺序

1. 读 `README.md`；
2. 读本文件；
3. 读 `docs/INDEX.md`；
4. 执行 `git status --short --branch` 与 `git log -5 --oneline`；
5. 执行 `npm test`；
6. 若进入空间阶段，先完成设计审查，再改核心代码；
7. 最后统一运行真实门禁并记录结果。

当前没有已知阻碍。最新运行修复已推送；本交接与索引更新完成后应再提交推送并保持工作区干净。
