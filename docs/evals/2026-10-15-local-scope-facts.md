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
