# 阶段2 · schema 可扩展注册表设计 v1.0

日期：2026-08-24
依据：`docs/STAGE2-BOUNDARY-DEFINITION-v1.0.md` 第1项，四步实现顺序第2步。这份文档回答该文档 §5 留下的第一个待定问题："schema 注册表的具体 API 形状"。

## 1. 问题

`worldSchema.ts` 的 `attributesByType` 此前是一个编译期字面量对象——加一个新实体类型（比如探针分支里的 `prop`）必须直接改内核源码。换一个主题世界（金庸/D&D/火星殖民地）几乎必然还要加更多类型，等于"内容包污染内核"在 schema 层重演。

## 2. 决策：运行时注册函数，不是声明式 schema 文件

在 `docs/STAGE2-BOUNDARY-DEFINITION-v1.0.md` §5 留下的两个候选（运行时注册 API vs. 每主题包自带声明式 schema 文件）之间，选**运行时注册 API**：

- 一个新的导出函数 `registerEntityType(entityType, attributes)`，内容加载代码（比如未来的 pack 加载器）在构造世界之前调用它，就能声明新类型，不用碰 `worldSchema.ts` 源码。
- 不引入声明式 schema 文件格式（YAML/JSON/自定义格式都不引入）——那是明显更大的范围，属于"内容包自带 schema"这个更大的问题，现在没有具体消费场景逼出这个需求（唯一的外部数据只有 `prop`/`person` 两种类型，用一次函数调用就能声明完，不需要一整套文件格式）。
- 不引入"每个属性自带值域声明"的能力——新类型只能声明"这个类型允许哪些属性名"，属性本身的取值校验规则（比如 `open_state` 只能是 open/closed、`posture` 的枚举）继续留在内核里，按属性名生效，跟哪个实体类型无关。这是刻意的收窄：值域声明本身要设计一套小型 DSL 才能做对，而现在没有任何外部内容需要自定义值域规则（`prop`/`person` 只用得到 `zh_name`/`en_name`，两个字符串属性）。

## 3. 具体行为

- `attributesByType` 从字面量对象改成模块级可变 `Map`，用同样的内置类型预置（卧室 fixture 用到的所有类型，100% 向后兼容，不需要任何调用方重新注册）。
- `registerEntityType(entityType, attributes)`：
  - 类型未注册过——正常注册。
  - 类型已注册、属性集合完全相同——幂等跳过（同一个类型被多次调用注册，比如多个测试各自准备世界，不应该报错）。
  - 类型已注册、属性集合不同——抛错。防止两个内容源静默地用不同定义覆盖同一个类型名，这类冲突必须显式暴露，不能被后调用的一方悄悄改写前一方的定义。
- `validateEntityType`/`validateAttribute` 的查找逻辑不变，只是从 `Map.has`/`Map.get` 读取而不是字面量对象。
- `validatePredicate`/关系谓词集合本次不动——那是 `docs/STAGE2-BOUNDARY-DEFINITION-v1.0.md` 里独立的第2项（`present_at`），已经做完。

## 4. 明确不做的事

- 不做"注销/替换已注册类型"的能力——注册只加不改不删，匹配阶段2契约本身"只加不改不删"的治理原则（第4步会正式写下来，这里先在这一个小范围内提前践行）。
- 不给 `MaterializedWorld.replay()`/`validateCommitmentSchema` 增加"传入一个 schema 实例"的参数——注册表继续是模块级单例，不做成每次 replay 各自持有一份的依赖注入对象。现在没有"同一进程内需要两份互相隔离的 schema"这个真实场景，做成单例更简单，符合"可行优先于完备"。
