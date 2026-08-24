# 主体能力：物理操作需要"够得着" 设计 v0.7

日期：2026-08-24
状态：设计（实现前）
对应：路线图 Layer B 第 3 项的后半部分（`docs/GWA-larger-architecture-study-after-v0.9.md` §9 "Subject / EpistemicAgent 采用能力建模"）

## 1. 问题：物理操作完全没有位置前提

实测确认（在真实构建上直接跑）：

```text
打开门 → 走到走廊 → 走到客厅
拿起钥匙   => committed "你拿起了钥匙。"   （钥匙在卧室床头柜抽屉里）
找钥匙     => committed "你找到了钥匙。"
```

`self` 已经在客厅，钥匙还在卧室的抽屉里，`take`/`observe` 完全不管——PlaceGraph 和 `move` 两次里程碑证明了"位置是真实的、门是真实的前置条件"，但那条纪律只覆盖了查询类操作（`observe`/`inspect_contents`/`locate`/`look_around` 命中 `queryKind` 时会经过 `triageFixedQuery`，间接调用 `isEntityPerceivable`）和 `write`（唯一显式调用了 `isEntityPerceivable` 的动作）。`open`/`close`/`take`/`place`/`put_inside`，以及不带 `queryKind` 的通用 `observe` 兜底分支（`objectTurn.ts` 最后的 `else` 分支，处理"找钥匙"这类非地点目标），全部从未检查过 `self.position`。

这正是架构研究文档 §9 点名的问题："身体行动能力...应该通过能力/规则组合，而不是把'人类常识'散落进动作实现"——现在的情况恰恰相反：能不能碰到一个东西，完全取决于该动作分支有没有*恰好*写了检查，而不是一条统一规则。

## 2. 最小充分方案：复用 `isEntityPerceivable`，不新建"可达性"概念

`perceptionPolicy.ts` 里的 `isEntityPerceivable` 已经是一个递归的、按房间标定的可感知性判定（沿 `contained_by`/`located_on`/`held_by` 关系链向上找到房间锚点家具，比较 `roomForPosition(self.position)`）。这次不新增一个平行的"可达性"谓词，而是直接让物理操作复用它——道理很直接：**在这个 MVP 的粒度上，看不见的东西也碰不到**，"够得着"就是"感知得到"的子集，没有必要在同一个房间模型上叠两套判定。

需要补的地方（`take` 已经通过 `write` 证明这条路可行，这次只是把同一条规则铺到其余分支）：

- `take`：目标必须 `isEntityPerceivable`；
- `open`/`close`：目标必须 `isEntityPerceivable`；
- `place`/`put_inside`：被移动的对象*和*目的地（桌子/容器）都必须 `isEntityPerceivable`——正在手里拿着的对象天然可感知（`isEntityPerceivable` 对 `held_by self` 的物体总是返回真），但目的地不一定；
- 通用 `observe` 兜底分支（非地点目标，比如"找钥匙"）：目标必须 `isEntityPerceivable`，而不是只检查其直接容器是否打开。

`write`/`inspect_inscription_presence`/`inspect_inscription_value` 已经有这个检查，不用动。所有地点相关的 `look_around`/`inspect_contents`/`locate`（走 `triageFixedQuery`）也已经有，不用动。

**一个需要写下来的隐含假设**：`isEntityPerceivable` 里的 `PLACE_VISIBILITY_EXCEPTIONS`（"隔着门/隔着过道能看见但人还没过去"）目前只覆盖 `hallway-1`/`living-room-1` 这两个地点实体本身，从未覆盖任何可被 `take`/`open`/`place` 操作的物理对象（钥匙、笔、纸条、抽屉、桌子都锚定卧室，没有例外条目）。所以"可感知 ⟹ 可操作"在当前物件集合上是安全的。但如果以后给某个可搬运物体也加上跨房间可见例外（比如"隔着门能看见桌上的钥匙"），这个等价关系就会失效，到时候必须把物理操作改成检查一个不含 `PLACE_VISIBILITY_EXCEPTIONS` 的更严格谓词，不能想当然继续复用 `isEntityPerceivable`。

## 3. 失败的呈现方式

物理操作是动作（action），不是查询——遵循现有约定，前置条件不满足时直接 `throw new ObjectTurnError(...)`（和"抽屉关着不能拿"、"笔不在手里不能写"用的是同一种失败形状），不是查询类操作那种返回 `boundary` TurnResult。中文/英文各给一句人话，不暴露 entityId：

```text
zh: "你现在够不着${label}。"
en: "You cannot reach the ${label} from here."
```

## 4. 明确排除

- 不建立正式的 `Capability`/`EpistemicAgent` 接口或能力注册表——这次只落地"物理操作需要同房间"这一条具体规则，验证的是规则本身该不该存在，不是先造一个通用能力框架再往里塞规则；
- 不给 `self` 建模能力差异（受伤、失明、失去意识、感知范围受限等）——`self` 仍然是唯一、能力恒定的主体；
- 不新建"可达性"谓词——按 §2 的论证，直接复用 `isEntityPerceivable`，仅在其失效前提被打破时才需要拆分（见 §2 的隐含假设记录）；
- 不改变任何查询类操作（`observe`/`inspect_contents`/`locate`/`look_around` 走 `queryKind` 的部分）——它们已经有这条规则，本次不重复验证；
- 不做"够得着但够不到最里面"这类更细的距离/姿势建模——同房间即可操作，不分远近。

## 5. 测试计划

- 本地单元测试：走到走廊/客厅后尝试 `拿起钥匙`/`打开抽屉`/`把笔放到桌子上`/`找钥匙`，均应被拒绝（`ObjectTurnError`）且不产生任何提交；回到卧室后同样的操作应恢复成功；正在手里的物体（比如先拿起笔再走到走廊）应该在任何房间都能被 `place`（因为 `held_by self` 天然可感知）——这是"目的地要检查、已持有的对象不需要重新检查"这条区分的专项验证；
- 全量回归：确认现有测试（尤其是从不移动就直接操作物体的既有测试）不受影响——它们全部发生在卧室内，位置门控对它们是无操作的；
- 真实模型 live eval：新建 `runReachabilitySequenceLiveEval.ts`，覆盖"卧室内操作正常 → 走到客厅后同样的操作被拒绝 → 走回卧室后恢复"的完整路径，接入 `runMvpLiveGate.ts`。

## 6. 完成标准

1. `take`/`open`/`close`/`place`/`put_inside`/通用 `observe` 都不再能跨房间操作物理对象；
2. 已持有的对象（`held_by self`）在任何房间都可以被放下/放置，不受这条新规则影响；
3. 现有全部测试和真实模型 gate 保持通过；
4. §2 记录的隐含假设（可感知⟺可操作，仅在当前物件集合上成立）被写进代码注释，不是只存在于设计文档里。
