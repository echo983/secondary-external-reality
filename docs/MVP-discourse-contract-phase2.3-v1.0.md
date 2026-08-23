# MVP Phase 2.3：会话指代合同报告 v1.0

日期：2026-08-23  
状态：里程碑完成

## 结论

MVP 已支持受约束的跨回合 `它 / it`：只有上一轮批准呈现形成的唯一 focus 可以被下一次输入消费。多对象呈现、插入 interface 回合或没有 focus 时，系统不会猜测实体。

## 实现

- 新增非权威 `DiscourseContext`，分离“曾暴露实体”和“一次性唯一 focus”；
- 显式别名继续通过共享 `ReferenceLexicon` 与 exposed 集合解析；
- pronoun 只绑定唯一 prior focus，并在本轮开始时消费；
- focus 仅来自 canonical presentation 的单一 attribute/relation subject；环顾和集合观察不制造唯一 focus；
- 指代绑定后仍重新执行 capability、PerceptionPolicy、Query Triage 和 commit admission；
- discourse 状态不写入 LanceDB world commits，不参与 canonical replay，也不跨进程冒充长期记忆。

## 呈现加固

真实模型首次评测发现两个 presentation 缺陷：输出内部 ID `key-1`，以及用“它”替代 packet 中要求呈现的实体名。`RiskAwarePresentationRenderer` 现会机械检查：

- 回应不得包含 fixture canonical entity ID；
- packet 要求出现的实体必须使用共享词典中的批准别名；
- 不合格文本自动回退到确定性 renderer。

这项审查只约束表达，不改变事实或补充 packet。

## 验证

- 本地完整回归：155/155；
- 真实 Cloudflare Workers AI 状态化语料：修复后连续两轮 11/11；
- 两轮 `fatalReplayIssues: []`；
- `钥匙在哪里` → `拿起它` 成功并提交钥匙动作；
- `看看周围` → `拿起它` 零提交拒绝；
- `钥匙在哪里` → `你好` → `拿起它` 零提交拒绝；
- `便签呢` 显式别名兼容；
- 会话 A 聚焦纸条、会话 B 隐藏纸条后，A 的 `它在哪里` 重新得到感知 boundary，零提交。

复现命令：

```sh
npm run eval:discourse-contract:live
```

## 下一步

Phase 2.4 应统一普通语言、对抗语言和 discourse 三组 live eval 的无秘密聚合输出，并扩充语义等价改写，而不是扩大 focus 猜测规则。之后再评估是否具备进入小规模人类探索测试的条件。
