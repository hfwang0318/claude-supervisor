# Task 1 续做：先检索明确文件，保留真实效果门槛

状态：用户要求继续优化直到任务 1 达标。当前仅完成机制修复和免费验证，真实模型收益尚未验收；不将局部回放当作有效事实采纳证据。

## 已复现原因

此前完整失败并集 24 次结果中，facts 的九个定位任务有六次 selection deadline、两次 source-missing、一次 file-limit，事实包为零。

Router 留存的四个成功 selector 形状请求中，返回正文只有 164–307 个字符，却用了 12.193–27.975 秒，含 2,758–6,565 个 thinking 字符；请求未设置 thinking／effort 控制。其余历史请求留存不足，不能虚构详细原因。此处不复制 raw body、thinking 或凭据，只保存固定统计和原 body SHA。

归一化已有主模型工具轨迹后发现，Tutanota 的首次候选是 `buildSrc/nativeLibraryProvider.js` 的 `cli`，旧 `asked.includes(name)` 把它匹配到需求里的 `client`，过早消耗每提示唯一事实任务。用真实相同症状的宿主行为测试复现，再改为完整标识符边界匹配；修改后回放不再在 `cli` 上触发，而是在后续真实 TypeError 上触发。归一化回放不等于逐事件重建原 SDK 时序。

## 最小实现

- 从程序生成的候选症状取得已观察的实现路径和最多两个完整标识符；从需求文本只取字面源码文件名，使用与原 FactRequest 相同的安全路径规则。
- 只有出现候选文件以外的明确源码文件、且总范围不超过六个文件时，才直接组成 `paths: []`、字面 terms、文件型 searchPaths。没有这类范围则使用原模型 selector。
- 本地路径只表示待核对范围，不认证文件存在、内容或调用关系。仍由原 inspector 完整读取、绑定版本和原文 hash，再由旁路形成 AssistPacket；最后保留 requirement 引用、实际 import/call、来源与 Binding 重验。
- 一任务最多一次 inspect；局部拒绝后不换猜测路径重试、不把 incomplete 提升成完整。模型最多两次／4,000 输出 token／30 秒活动预算，读取与文件数／大小／输出／组合输入限制均保持。
- `FACTS_JOB` 加 `selectionMethod: local-scoped | model`，不记录请求路径、模型原文或源码。

## 免费证据

新增宿主案例先失败：22 秒 packet 回复在旧流程会被当作 selector、无法投递；局部缺文件仍会花一次模型调用。新流程分别投递、以及保持 unknown 且零模型调用。独立纯函数用例覆盖不安全／越界／秘密路径、不足／超量范围和不凭空扩展范围。另一个回归先复现 `cli`／`client` 错配，再修复。普通完整检查 `node scripts/check.mjs`：162 个宿主测试及全部类型／清单、真实只读／局部事实／进程隔离、scorer、SWE adapter 自检通过。

以下使用同一 pinned Linux task image 的 base、原生 Node 22.23.3／GNU loader、无网络、只读挂载、0.25 CPU／256 MiB，不调用模型：

| 原任务／字面范围 | 完整检索 | 已核验原文条数 |
| --- | --- | ---: |
| Ansible 42355d1：vars/manager.py + playbook/task.py，copy | 是 | 19 |
| OpenLibrary b67138b：marc_base.py + parse.py，get_fields | 是 | 34 |
| ProtonMail e65cc5f：elementsReducers.ts + elementsActions.ts + elementsSelectors.ts，retry | 是 | 15 |

原工作区中的临时修改没有重建，不能称为精确历史重放。旧范围拒绝仍保留；上表只证明新的具体文件范围可被原安全 inspector 完整核对。原始旧 run/runtime/receipt/patch 不覆盖，续做账本和回放元数据在本计划的忽略工作目录。

独立审查提出的三个重要问题均已复现后修复：完整文件名分词避免截取 `.js.map`、`.pem` 或含 `+` 的文件名；在分词前拒绝超长输入；本地文件范围通过宿主传递 `filesOnly`，真实 inspector 拒绝伪装成文件名的目录。普通模型 selector 的显式目录搜索仍保留。新增纯函数测试先失败，真实目录案例也先失败，修复后全绿。未发现来源绕过或凭据泄露，不通过放宽安全限制解决拒绝。

## 真实验收待办

普通测试每次全部运行。日常模型回归按用户新规则随机一个双失败任务、两组各一次，冻结 seed／selection／新 runtime／新 out；完整验证才运行最近完整轮次的失败／未知并集，不自动叠加 quick。主／旁路均 Flash，无更强 fallback，供应商准入最多四并发，资源压力只暂停新派发，保留已接受失败／未知，不自动重试。

- [ ] 核对实际 SourceFact 与原文、版本和投递轨迹。
- [ ] 在至少两个不同任务中记录事实前的错误／遗漏、事实后的具体主模型动作及独立验收，同时保留对照组。
- [ ] 区分功能改善、仅路径／效率变化和无效介入，费用缺失记 unknown；任务 2／3 仍关闭。

## 首次局部流程的真实阻碍与继续修复

冻结 `7070908` 后按已保存 seed 抽出的 ProtonMail e65 快速回归正在运行，两组各一次，未停止、重试或覆盖。facts 的真实阶段记录已确认 `selectionMethod=local-scoped` 完成检索，但 packet 阶段 30,022ms 到期；网关同一非流式 maxOutput4048 请求在 29,495ms 记录 upstream-error，没有返回体，完整用量和具体供应商耗时均 unknown，不能断言全部时间用于推理。

同一仍存活的只读工作区检索出原有 15 行事实，包含 `dispatch(retry(newRetry(...)))`。原信息包 gate 仅认导入或成员方法调用，拒绝该普通函数调用；回归测试先得到 164pass/1fail，新增短 ID 绑定回归后 164pass/2fail。修复支持明确的普通调用表达式，保留定义、控制语句、注释及字符串不算调用的案例。

局部旁路的新协议只选择最多六个 `f1` 等短 ID 或 null，宿主映射回 inspector 的原始事实 ID，再经过原有来源、范围、requirement 引用和 Binding gate。模型不再生成 question／explanation／修复意见，宿主只用匹配的真实需求原行和固定未验证提示；旁路看到原文、路径、行号与明确范围，文件 hash 仍由宿主绑定、重验和展示，不要求模型复制。其他模型 selector 流程不变。完整普通检查现为 166 个宿主测试及全部工程检查通过。

这属于收到真实失败后修复的下一版，不替换 `7070908` 的运行。下一版最终验证使用最近完整轮次六题失败／未知并集、两组各一次，共十二次；不另外再抽快速用例。先等当前两次与审计自然结束，再启动唯一控制器，不同时运行 quick 和 full。当前仍未取得有效事实采纳链，任务 2／3 关闭。

## 快速回归结束与真实投递核对（2026-10-15 11:10 CST）

`7070908` 的 quick2 于 11:08:43 CST 完整结束并审计，两组均官方失败，0 unknown、0 事实包。existing 主模型约 2,744 秒完成，facts 主模型达到原 3,000 秒上限后保留部分 patch 并评分失败；未手动取消或重试。两组原 patch、回执、全部观察用量、长期推理和 deadline 限制保留，完整费用仍 unknown。

旧控制器及容器全部退出后，`934f705` 的最终十二次验证于 11:09:13 CST 启动，唯一 monitor PID31405、实际准入上限4，未与 quick 同时执行；四个初始槽位均已成功派发。

ProtonMail 首个 local-scoped packet 在 10,698ms 准备完成，选择实际 `elementsActions.ts:38` 的 `dispatch(retry(newRetry(...)))`，源 manifest 与只读检索一致。实际下一条主模型请求中也包含了反馈，证明超过单纯 context-returned 日志的投递机制证据。但原调用行同时已经出现在同批 `Read` 工具结果中，因此**没有新增事实，不能计为任务1有效链**；即便后续官方测试通过，也不能把该重复行作为新增事实收益。

这个具体重复触发来自旧 signal 仅检查相关 import，没有检查实际普通调用。新增纯函数与宿主行为回归先 RED166pass/2fail，再实现对当前项目成功 Read 的普通调用识别，支持原生行号；遇到字面字符串、失败读取、项目外读取仍不把它们视为已知调用。GREEN168 个宿主测试与全部普通检查通过。按保留的实际请求规范化工具记录免费重放：冻结旧函数生成 missing-caller 症状，新函数返回 null；未重建 SDK 逐事件时序，不复制原始请求或 thinking。

此修复只修改开发工作树，**正在运行的十二次仍使用冻结934f705**。不改 runtime、selection、预算和原回执，不为这个修复立即追加付费批次；先收齐当前结果再判断下一步。Task1 有效链当前仍为0，Task2/3关闭。
