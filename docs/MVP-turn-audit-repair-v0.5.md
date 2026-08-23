# MVP 回合审计自修复 v0.5 结果

日期：2026-08-23

已实现从权威 `world_commits` 向非权威 `turn_attempts` 的单向自修复。新提交保存 `attemptedTtd`，配合 `rootTurnId / stepIndex / stepCount` 可完整恢复成功步骤。会话在处理第一个新输入前执行一次幂等修复。

恢复器不会猜测旧数据：缺少元数据的提交计入 `skipped`。已有且与提交一致的记录计入 `existing`；失败记录或字段不一致时抛出冲突，绝不静默覆盖。

本地 73 项测试通过，覆盖重启补建、重复修复、旧提交跳过和冲突保护。

真实 SSH + Cloudflare Workers AI 回归通过。三步输入产生 3 个带恢复元数据的真实提交；将它们写入一个没有审计表的新 LanceDB 并重启后，修复器补建 3 条成功审计，准确恢复三个原始步骤。
