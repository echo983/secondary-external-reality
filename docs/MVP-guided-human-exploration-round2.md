# MVP 引导式人类探索 Round 2

日期：2026-08-23  
状态：可开始

## 目的

本轮不是验证“开放世界已经完成”，而是收集真人在现有卧室小世界里的自然表达，并确认合法小闭环、认识边界和零提交拒绝在 SSH 中同样可信。

## 启动

先通过统一门禁：

```sh
npm run eval:mvp-gate:live
```

为本轮选择一个新的数据路径，避免覆盖已有测试世界：

```sh
npm run build

SER_SSH_HOST_KEY_PATH=secret/ssh_host_ed25519_key \
SER_SSH_PASSWORD_FILE=secret/ssh_password \
CLOUDFLARE_API_TOKEN_FILE=secret/cftoken.txt \
SER_ACTION_IR_MODE=active \
SER_DATA_PATH=.world/human-round2.lancedb \
SER_SSH_PORT=2222 \
npm run start:ssh
```

另一个终端连接：

```sh
ssh -p 2222 ttd@127.0.0.1
```

如果端口占用，可同时把服务端 `SER_SSH_PORT` 和 SSH 的 `-p` 改成例如 `2223`。不要删除或覆盖原有 `.world` 数据来解决端口问题。

## 建议探索方式

先输入 `help`，然后用自己的说法探索，不必逐字照抄：

1. 环顾、询问自己在哪里；
2. 找一个明确物体，下一轮用“它”继续操作；
3. 查看关闭的抽屉，再打开并查看；
4. 做一个两步动作，其中第二步故意无法完成，观察部分成功；
5. 尝试否定、假设或条件表达，确认世界没有误执行；
6. 写一个数字到纸条并藏起，做几件别的事后再寻找和读取；
7. 自由输入未在示例中的普通说法。

## 记录原则

- 保留终端中“输入 → 回应”的原样记录；
- 特别标记：答非所问、内部 ID、错误成功、错误失败、隐藏信息泄漏、前后状态矛盾；
- 不要手工修改 LanceDB 来让测试通过；
- token、SSH 密码和 secret 文件内容不得复制进报告或 Git；
- 不将门外空间、任意文字写入和未开放新物理动作视为本轮必须成功。

## 当前会话语义

世界状态存储在指定 LanceDB 中，可跨重连延续。`它 / it` 的临时 focus 只属于当前 SSH shell，不跨连接共享，也不跨重连冒充长期记忆。多个 SSH shell 共享同一世界时，服务器会串行处理世界回合，且每次指代执行前重新检查当前世界。
