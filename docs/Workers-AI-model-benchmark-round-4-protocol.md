# Workers AI 模型基准 · 第四轮协议实验

日期：2026-08-23  
状态：协议实验；安全失败有效，协议仍需强化

## 目的

验证第三轮修正后的数据流：

```text
Qwen 条件化候选
→ 代码 schema/投影预检
→ 测试夹具提供已提交解析值
→ 代码求值 eligible candidate
→ Mistral 逐项 pass/fail
```

本轮不允许模型选择隐藏条件。解析值由测试夹具预先给定。

## 测试场景与解析值

### 跨身取钥匙

```text
left_hand_cross_body_reach = sufficient
tea_stability = stable
```

### 腿麻起身

```text
stand_now = unstable_success
move_3m_now = impaired_success
```

### 陌生守卫

```text
unverified_kinship_claim_response = request_verification
```

## 结果

| 场景 | Qwen JSON | 规则预检 | Eligible | Mistral |
|---|---|---|---:|---|
| 跨身取钥匙 | 有效 | 通过 v0.1 基础检查 | 1 | pass |
| 腿麻起身 | 有效 | 拒绝：4 个未知投影地址 | 0 | 未产生有效审查对象 |
| 陌生守卫 | 有效 | 基础检查通过 | 0 | 未产生有效审查对象 |

表面上只有钥匙题通过，但强化复核后发现其候选也不应直接提交。因此本轮没有任何候选达到完整提交标准。

## 具体发现

### 1. 条件化协议确实减少了自由故事

钥匙题中，Qwen 不再断言“左手不可能取钥匙”，而是正确请求解析：

- 左手当前能否跨身到达右侧裤袋；
- 跨身动作期间茶杯是否保持稳定。

给定 `sufficient + stable` 后，成功分支成为 eligible。这证明条件化候选方向有效。

### 2. 仅校验地址存在还不够

腿麻题声明需要解析：

- `stand_now`；
- `move_3m_now`。

但它没有在 conditions 中使用这两个投影，反而把以下完整事实字符串当成投影地址：

```text
self posture=sitting_on_bed_edge
self.left_leg sensation=numb
door distance=3m
door unlocked
```

基础规则层成功将候选拒绝。协议需要新增“每个 requires_resolution 必须参与条件”的机械检查。

### 3. 候选内部可以同时写入互斥事件

守卫候选只为 `policy_response=admit` 建立条件，而测试解析值是 `request_verification`，因此没有 eligible candidate，系统安全停止。

复查原候选还发现，其 `proposed_events` 同时包含并重复：

```text
request_verification
admit
deny_entry
```

这三类结果互斥。说明事件类型必须使用闭合 schema，并由代码检查互斥性，不能依赖陪审员阅读自由文本发现。

### 4. “成功”必须具有结果效果

钥匙候选虽然被 Mistral 通过，但仍有结构问题：

- 把已有的 `right_hand hold hot_tea` 写成一个新 action；
- 写了 `use key to open door` 动作，却没有提交门状态变化；
- `outcome_kind=success` 与空 `proposed_state_changes` 不匹配。

Mistral 没有发现这些问题。成功候选必须由代码检查目标效果是否完整构成。

### 5. 空候选集不应进入陪审

面对空 `eligible_candidates`，Mistral 返回了一个虚构的：

```json
{"candidate_id":"none","verdict":"pass"}
```

这再次说明模型会填补 schema 空位。正确流程是在代码层发现候选为空后直接停止，不调用陪审员。

## 性能观察

- Qwen 三题响应约 1.3～2.3 秒；
- Mistral 审查约 2.1～4.8 秒；
- JSON 均可解析；
- 结构合法不等于语义或事务合法。

## 结论

条件化候选显著优于“生成三个完整故事”，因为隐藏条件开始变得可见、可解析、可拒绝。但目前 schema 仍允许模型：

- 声明但不使用解析投影；
- 把事实字符串伪装成地址；
- 在一个候选中加入互斥事件；
- 宣布成功却不提交目标状态变化；
- 在空输入下发明审查对象。

下一步不是继续调 prompt，而是实现一个小型的纯代码协议验证器，并用固定测试夹具做回归。只有通过验证器的候选才值得调用 Mistral。

