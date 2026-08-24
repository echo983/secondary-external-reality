# 观察带宽：细节感知需要更近的位置 设计 v0.8

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 第 3 项的最后一块（`docs/GWA-larger-architecture-study-after-v0.9.md` §3 "文字是否处于观察带宽内"）

## 1. 问题

实测确认：写下纸条后走到门口（和床边同属"卧室"这个房间），依然能精确读出纸条上的数字——`inspect_inscription_value`/`read` 目前只检查"是否在同一个房间"（`isEntityPerceivable`，物理够得着那次刚验证过的同一套判定），从不区分"看得见有这么个东西"和"看得清上面写的字"。这正是架构研究文档 §3 点名的例子："文字是否处于观察带宽内"——房间级的可感知性回答的是"这个东西在不在你的感知范围里"，回答不了"细节你分辨得清楚吗"。

和上一条"物理够得着"不同：这次不是"完全没有任何门槛"的漏洞，而是"只有一级粗糙门槛（同房间），缺一级更细的门槛（够近）"。

## 2. 范围：只挡"读取精确文字内容"，不挡"看到有这张纸条"

和用户确认过的方向：新增门槛只作用于**精确读取纸条内容**这一件事，不作用于"看到/找到纸条这个物体存在"。具体到操作上：

- `inspect_inscription_value`（"纸条上写着什么"）与 `read`（"翻开枕头看看下面，并读纸条"，找到+读取的复合动作）——新增门槛，要求 `self.position === "bedside"`（枕头/床头柜都紧挨着床，这是纸条实际所在的位置）；
- `inspect_inscription_presence`（"纸条上有没有字"）——**不变**，依然只要求同房间可感知。现实直觉上，隔着房间也能看出"这张纸上有墨迹"，但看不清写的是什么字；
- `observe`/`locate`（"找纸条"/"纸条在哪"）——**不变**，纸条本身作为一个物体的存在/位置，依然只要求同房间可感知；
- `write`/`write_and_hide`——**不变**。写字本身就是"正在近距离操作这张纸"的动作，天然满足更近的位置要求，没必要重复加一道检查（而且写字目前还会经过"物理够得着"那条规则里对纸条本身的可感知检查）；
- `recall_inscription`（回忆）——**不变**，回忆读的是已经获得过的证据快照，和当前所在位置完全无关，这两个机制是正交的。

只有一个位置符合"够近"：`bedside`。`doorway`/`hallway`/`living_room` 都不够近——即使 `doorway` 和 `bedside` 同属 `roomForPosition` 的"卧室"房间。

## 3. 实现落点

`inspect_inscription_value` 已经带着 `queryKind: "inspect_attribute"` 走 `triageFixedQuery`；当判定结果是 `perceive_fixed_now`（房间级可感知）后，在落到具体分支之前再插一道位置检查，不通过就直接返回 `boundary`（不是异常）——这是查询类操作的标准失败形状，和 `TARGET_NOT_PERCEIVABLE`/`RECOLLECTION_FADED` 一致。新增 `PublicBoundaryCode`：`OUT_OF_OBSERVATION_BANDWIDTH`。

`read` 是复合的"找到+读取"动作（不带 `queryKind`，从不经过 `triageFixedQuery`），维持它自己已有的失败风格——不满足位置要求时直接 `throw new ObjectTurnError(...)`，和它现有的"没有可读内容"失败路径用同一种形状，不强行把它改造成 boundary。这个不对称是刻意的：查询类操作已经在用 boundary 表达认识边界，复合动作类操作本来就在用异常表达前置条件失败，这次新增的门槛应该继续落在各自已有的失败惯例里，不是发明第三种形状。

`inspect_inscription_presence` 完全不动——它不需要新的门槛。

## 4. 明确排除

- 不引入连续的"距离"数值或视野锥——只有"够近的一个位置 / 不够近"这一级二元判断，复用已有的 `PositionValue` 枚举，不新增空间表示；
- 不把这条规则泛化到纸条以外的任何属性——这个 MVP 里没有第二个"精细文字内容"类事实，泛化没有验证对象；
- 不影响 `inspect_inscription_presence`/`observe`/`locate`——它们回答的是"东西在不在/是什么"，不是"写的是什么"，继续只要求房间级可感知；
- 不影响 `write`——书写本身已经隐含了近距离操作。

## 5. 测试计划

- 本地单元测试：床边写字+读取成功；走到门口后 `inspect_inscription_value` 返回 `boundary`（`OUT_OF_OBSERVATION_BANDWIDTH`），零提交；同样走到门口后 `read`（复合查找+读取）被拒绝（`ObjectTurnError`）；`inspect_inscription_presence`/`观察纸条`/`纸条在哪` 在门口依然正常工作（对照组，证明只挡了精确内容）；回到床边后 `inspect_inscription_value` 恢复正常；
- 全量回归：确认已有测试不受影响——所有既有的纸条读取测试全部发生在默认的 `bedside` 位置，从不在别处读取；
- 真实模型 live eval：新建 `runObservationBandwidthSequenceLiveEval.ts`，覆盖"床边写字读取成功 → 走到门口后精确读取被拒绝但仍能确认'有字'/找到纸条这个物体 → 走回床边恢复"的完整路径。

## 6. 完成标准

1. `inspect_inscription_value`/`read` 在非 `bedside` 位置无法读出精确内容，`bedside` 位置不受影响；
2. `inspect_inscription_presence`/`observe`/`locate` 在门口等非 `bedside` 位置继续正常工作，证明这次只挡了"精确内容"这一级，没有误伤"存在/有没有字"这一级；
3. `recall_inscription`/`write` 不受影响；
4. 现有全部测试和真实模型 gate 保持通过。
