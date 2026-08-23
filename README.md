# secondary-external-reality

一个通过普通 SSH 提供 `ttd:`（try to do）界面的实验性“第二外部现实”MVP。用户输入的是主体试图执行或观察的自然语言；服务器根据可重放的世界状态、封闭因果原语和认识边界，返回与输入同语言的可信外部回应。

项目以 GWA（Generative World Architecture）为长期设计纲领，但当前只追求狭窄、可验证、可逐步扩展的闭环。核心纪律是：LLM 可以解释、提案、陪审和润色，不能直接写入 WorldTruth。

当前版本：`0.2.0`。完整工程快照见 [上下文交接](docs/CONTEXT-HANDOFF-2026-08-23.md)，文档导航见 [docs 索引](docs/INDEX.md)。

## 当前能力

- 普通 SSH 登录与 `ttd:` 文本循环；
- 中英文自然语言、闲聊/残句/能力询问/否定/假设/条件的保守分流；
- 环顾、手持清单、对象位置、打开容器内容和纸条内容查询；
- 打开/关闭、拿起、放到表面或容器；
- 在纸条写入 1–64 位数字，隐藏、重启后寻找并精确读取；
- 用“然后”执行有序多动作，后续失败时保留已提交的真实前缀；
- 上一轮唯一焦点的受限 `它 / it` 指代；
- LanceDB append-only 提交、回合审计、规范证据/认识图和确定性重放；
- 双 Workers AI Interaction IR 工位并行解释，机械共识后才允许进入确定性 compiler。

尚未开放：门外空间、一般移动原语、动态实体创建、任意文字书写、可信能力问答和真正开放世界。`走到门口` 被理解但应返回“尚无世界原语”；`看看门外` 应返回未建模范围，而不是错误显示室内。

## 权威处理链

```text
SSH input
→ two independent Interaction IR workstations
→ strict schema/source-span validation
→ mechanical material consensus
→ deterministic reference + capability compiler
→ replayed world preconditions
→ deterministic validation / dual reality jury where applicable
→ append-only LanceDB commit admission
→ typed observation/evidence/acquisition
→ approved presentation packet / bounded renderer
```

语言模型不得输出可直接提交的实体状态、结果、证据或 commitment。实体 ID、空间关系、能力、当前状态和最终提交都由本地可信层决定。

## 安装与测试

需要 Node.js 20+。

```sh
npm install
npm test
```

当前基线是本地 `177/177`。真实 Cloudflare Workers AI 统一门禁为 8 组 `96/96`：

```sh
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt npm run eval:mvp-gate:live
```

真实门禁会调用外部模型并使用临时 LanceDB；不要在无意消耗 API 配额时运行。各测试入口见 `package.json` 和 [文档索引](docs/INDEX.md)。

## 启动 SSH MVP

本地密钥、密码、token 和世界数据均被 Git 忽略：

```sh
mkdir -p secret
ssh-keygen -t ed25519 -f secret/ssh_host_ed25519_key -N ''
printf '%s\n' 'replace-with-a-long-local-password' > secret/ssh_password
chmod 600 secret/ssh_password secret/ssh_host_ed25519_key
```

推荐用全新的数据路径进行每轮人测：

```sh
npm run build

SER_SSH_HOST_KEY_PATH=secret/ssh_host_ed25519_key \
SER_SSH_PASSWORD_FILE=secret/ssh_password \
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt \
SER_INTERACTION_IR_MODE=active \
SER_ACTION_IR_MODE=active \
SER_DATA_PATH=.world/human-next.lancedb \
SER_SSH_PORT=2222 \
npm run start:ssh
```

另一个终端连接：

```sh
ssh -p 2222 ttd@127.0.0.1
```

若本地测试主机密钥变化：

```sh
ssh-keygen -f "$HOME/.ssh/known_hosts" -R '[127.0.0.1]:2222'
```

服务器默认只监听 `127.0.0.1`，使用密码认证。公网暴露、生产认证和多租户隔离不属于当前 MVP。

## 配置

- `SER_SSH_HOST_KEY_PATH`：必需，SSH host private key；
- `SER_SSH_PASSWORD_FILE`：必需；
- `CLOUDFLARE_API_TOKEN_FILE`：默认 `secret/cftoken.txt`；
- `CLOUDFLARE_ACCOUNT_ID`：可覆盖当前测试 account；
- `SER_DATA_PATH`：默认 `.world/world.lancedb`；
- `SER_SSH_HOST` / `SER_SSH_PORT` / `SER_SSH_USER`：默认 `127.0.0.1` / `2222` / `ttd`；
- `SER_INTERACTION_IR_MODE`：`off | shadow | guard | active`；
- `SER_ACTION_IR_MODE`：`off | shadow | active`。

## 代码导航

- `src/interactionIr/`：双工位语言构成、验证、共识与 compiler；
- `src/turn/`：回合路由、序列、对象动作与审计；
- `src/world/`：fixture、实体目录、引用词典、物化世界与 schema；
- `src/protocol/`：候选验证、选择与提交准入；
- `src/query/`、`src/epistemic/`、`src/presentation/`：Query Triage、证据/认识图与严格呈现；
- `src/storage/lanceCommitStore.ts`：LanceDB append、锁、审计表与重放入口；
- `src/replay/`：legacy-compatible canonical replay；
- `src/eval/`：本地/真实模型评测脚手架；
- `test/`：Node test 回归套件。

贡献或启动新子任务前，先读 [上下文交接](docs/CONTEXT-HANDOFF-2026-08-23.md) 的“不变量、现状边界与协同建议”。不要提交 `secret/`、`.world/`、`dist/` 或 token 内容。
