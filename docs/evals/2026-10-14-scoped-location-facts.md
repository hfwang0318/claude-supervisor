# 局部定位事实修复与验证 — 2026-10-14

本轮继续原计划任务 1：此前完整 SWE Pro 对比两组均 27/30，但没有返回的事实包，尚未达到 probe/recovery 的进入条件。增量选择器已在 `f70e7b4` 交付。本轮修改的是核心事实检索流程。

## 已复现的机制缺口

同一份 `feature/app.cjs` 的真实 `require("./utils.cjs").parseDate` 调用及实现，在只有两个源文件时返回 2 条事实；添加 201 个无关文件后，全项目字面检索整体返回 incomplete。单独读取调用文件仍有效，说明失败来自搜索范围与资源约束的组合。

原始 30 项模型日志没有保存旁路回复和具体检索请求，不能据此断定本缺口解释了全部历史零输出。超时、无介入、非法请求与范围不足都可能使流程停止，因此新版本增加阶段记录，保持未知与真实 abstention 分开。

## 本轮变更

- `FactRequest.searchPaths` 可选，最多 6 个明确相对文件／目录。2 个字面词只在给定范围内搜索，重叠范围去重；省略字段保留旧行为。
- 长文件可通过 `paths: []` 和文件级搜索范围只返回匹配原文行；整文件读取、内容 hash 和修改后失效机制保持，不默默裁剪请求范围。
- `FactView.searchScope` 与所读文件一并绑定 manifest hash；组包提示及主模型反馈都标记范围之外未知。范围元数据非法、变更或过期不投递。
- 局部目录（含空目录）的成员及目录版本也纳入 manifest，新增／删除调用文件后旧视图失效。阶段记录使用不等待持久化的诊断路径，存储停顿不拖住事实任务。
- 所有旧文件／字节／输出／活动时间限制继续共享；没有增加调用、第三轮回复或结束阻塞。`FACTS_JOB` 仅记录选择、检索、组包阶段与 prepared/abstained/invalid/unknown 状态；prepared 不等于投递或采纳。

## 免费真实源码回放

使用原清单中的固定镜像、Node 22.23.3，容器无网络、根目录只读，挂载可信检索器与原 Node 运行时。不加载项目模块，不向仓库写入，不读取 gold patch 或官方隐藏验收。本表范围由原需求和基础仓库文件清单确定；没有模型调用。

| 任务 | 全仓库检索 | 局部检索 | 再验版本 |
|---|---|---|---|
| Qutebrowser c09e143，`GUIProcess` / `was_successful` | incomplete，0 条 | `qutebrowser/misc/guiprocess.py`，6 条事实 | 通过 |
| Tutanota f3ffe17，`entropy` / `EntropyCollector` | incomplete，0 条 | `src/api/main/EntropyCollector.ts`、`src/api/worker/WorkerImpl.ts`，26 条事实 | 通过 |

这些回放验证真实原文行号、文件 hash 和范围可用性，不是旁路选择成功或主模型采纳证据。收据在被忽略的 `eval/results/scoped-facts-development/repository-replay.json`。

## 工程验证与后续比较

新范围解析、反馈、宿主集成和阶段记录的四项测试先失败；真文件大仓库回归也先失败。非法范围进入组包的独立回归先失败后修复。现有取消、过期、off、两次调用及 64KiB 输入检查均在最终全套验证中通过。

免费命令：`node scripts/check.mjs`，`node scripts/selftest-scoped-facts.mjs`。Node 22 的真文件及 assist 评分自检已运行；评分器的坏产品负例会输出预期的 `2 != 29` 断言，评分自检本身退出 0。

一次独立审查发现目录成员未核验和诊断持久化阻塞两个重要问题，均已写出失败回归后修复。目录新增匹配文件／原空目录新增文件会拒绝旧视图；阶段存储写入悬挂时主模型仍可取得准备好的事实包。最终全套工程检查通过 149 项宿主测试、TypeScript、真实文件／进程及全部评分器自检；修正版局部源码检查再次在 Node 22.23.3 下通过。

新版本独立审查和冻结后，按既定失败并集只运行 existing/facts 各 5 项，最多两并发，使用全新输出目录。记录实际模型、任务及运行时身份、旁路阶段、事实投递、主模型后续动作和新容器独立验收；失败和超时不自动付费重跑，费用缺失仍为 unknown。最终结果与审计如下。

## 冻结比较协议

代码冻结为 `7aa997f`，运行记录目录为 `eval/results/scoped-facts-development/comparison-7aa997f`。只运行原 30 项中任一组失败的 5 项，每项 existing/facts 各一次，共 10 次；历史双通过的 25 项未在本版本重跑。模型及旁路均显式使用 `zhipu/glm-5.3[1m]`，网关核对真实返回身份 `glm-5.3`，默认 reasoning，seed 53，最多两并发；每个 worker 1 CPU／4096MiB，agent 与独立 grader 各有 50 分钟上限。没有追加付费重试或顶级模型对照。

各任务先完成免费空 patch 失败／参考 patch 通过校准，再进入 worker 槽位；5 个固定镜像均通过当前来源／grader 绑定的校准。两个 arm 和全部任务统一采用同一份 Claude Code 2.1.295、Node 22.23.3 原生字节及 GNU loader，镜像系统库不改写。另有 5/5 无网络插件启动预检。worker 仅获得原始需求和基础仓库，不获得 gold patch、隐藏测试或外部工具；结束后销毁 worker，再由新容器验收捕获的 patch。

| 绑定对象 | SHA256 |
|---|---|
| 原 30 项 manifest | `1d3260043ef0589d44483bc46243e4331233bb13b2952cf71e92cb228eb0d628` |
| 原有效 baseline summary | `6e7719db76f68cc3dbd909bfb3c6ce06719f72089843a97105862883d0ddd63c` |
| 本轮失败并集 selection | `3f231c3c866b13c9ceff14c256230b3c3aab572d1232cfe0da5a054858e66f55` |
| 本轮 experiment | `6b38ba3cbaeeaad72322de6a5db54789b62526053708d778041ab7a0865b30be` |
| existing 插件 | `22a20b6587e64c256d4977b8ea0fe35e1bb5346d993b8b51743832a431921e41` |
| facts 插件 | `ee8271c25c0edfd6d8711ff33468d82654681805c73fa29eb360f3dca28caa57` |

完整 native、loader、gateway、adapter、模型及环境身份见 `experiment.json` 和 `runtime/identity.json`。统一 loader 是本轮兼容性策略，与历史运行时存在差异，因此历史修好／回归只是同任务结果变化，不能单独归因于代码修改。

客户端仍传入每次 `maxTokens: 2000` 并检查每提示至多两次旁路调用／4000 返回 token／30 秒活动额度。但网关观察到 SDK 请求的 `max_tokens` 可为 4048，包含额外 thinking 预算；这不能证明外部服务被硬限制在 4000 token。所有完整使用量和实际费用保持 unknown，不把账单缺失当作零开销，不宣称费用优势。

## 10 次正式比较结果

2026-10-14 04:11–06:26 UTC（北京时间 12:11–14:26）完成全部 10 次运行，controller 正常退出、未中断。10 个 agent 均正常结束；官方新容器验收为 3 次通过、7 次失败、0 次 unknown。下表分母仅为这 5 项，不拼接历史 25 项形成新版 30 项成绩。

| 用例 | existing 历史 → 本轮 | facts 历史 → 本轮 | 本轮 facts 阶段／实际事实包 |
|---|---|---|---|
| Flipt c172805 | 通过 → 失败 | 失败 → 失败 | 无事实任务阶段，0 包 |
| OpenLibrary b67138b | 失败 → 失败 | 通过 → 失败 | inspection unknown，0 包 |
| ProtonMail e65cc5f | 失败 → 通过 | 失败 → 失败 | selection unknown（约 30 秒超时），0 包 |
| Qutebrowser c09e143 | 通过 → 失败 | 失败 → 通过 | inspection unknown，0 包 |
| Tutanota f3ffe17 | 失败 → 失败 | 通过 → 通过 | selection unknown（约 30 秒超时），0 包 |

existing 为 **1/5**，facts 为 **2/5**；相较历史，existing 修好 1 项、回退 2 项、仍失败 2 项，facts 修好 1 项、回退 1 项、仍失败 2 项。每项仅一次，不能证明稳定优越性、统计显著性或代码导致回退。没有本轮双通过任务，5 项全部保留。

每个正结果都再次核对：当前就绪收据、真实模型身份、固定镜像、base commit、捕获 patch SHA256，以及官方必需测试逐项 PASSED。ProtonMail existing 的 3 项、Qutebrowser facts 的 105 项、Tutanota facts 的 3 项全部满足。Tutanota verifier 共解析 108 项，必需范围为 3 项。失败收据保留原样：例如 Qutebrowser existing 解析 105 项，但 `test_cleanup` 失败；Flipt 两组和 ProtonMail facts 未解析完整必需范围，不能写成完整验收通过，也不能仅据此解释为定位失败。

阶段统计为 facts 5 个任务中 4 个触发选择调用：2 个 selection unknown、2 个 inspection unknown、1 个未触发；没有 packet prepared、真实投递或可审计采纳。两个 inspection unknown 都曾收到旁路回复，检索进程结束但没有可用视图；日志没有保存具体请求／原回复，无法确认模型是否选用了新 `searchPaths`，也不能细分未知原因。unknown 不是有效 abstention，更不是通过。

保留三条不完整的证据链，避免把 B 通过作为监督增益：

1. Qutebrowser facts：旁路选择回复 → inspection unknown，无新事实 → 主模型修改 `guiprocess.py`、调用方及自有测试 → 105 项官方必需测试通过。没有可审计“首次错误步骤 → 新事实 → 改变路径”，因此不归因于 facts。
2. Tutanota facts：选择调用 29996ms 超时 → 无事实投递 → 主模型修改 entropy 主线程／worker 相关实现 → 3 项官方必需测试通过。免费范围回放的 26 条事实没有进入此次模型流程。
3. ProtonMail facts：选择调用 29994ms 超时 → 无检索或新证据 → 主模型提交 mail hooks／reducers 等修改 → 独立验收失败。这个负例保留，不用另一次 existing 成功补成 facts 成功。

## 开销、下一轮与裁决

| 本轮实际观察 | existing（5 次） | facts（5 次） |
|---|---:|---:|
| agent 时间中位数 | 21.21 分钟 | 24.38 分钟 |
| agent 时间合计 | 102.45 分钟 | 128.15 分钟 |
| 网关模型请求数（包含旁路） | 485 | 610 |
| 插件旁路调用记录 | 9（answered 1／unknown 8） | 4（answered 2／unknown 2） |
| 返回的事实包 | 0 | 0 |
| 已观察 input token | 608,015 | 813,088 |
| 已观察 output token | 276,927 | 336,627 |
| 已观察 cached token | 31,180,480 | 36,691,840 |
| 完整用量／实际费用／每成功费用 | unknown | unknown |

每条 usage 收据均 `complete: false`；表中 token 是已观察的部分用量，不能替代完整账单。旁路 unknown 记录中的 0 也不能解释为调用免费。免费额外控制为 5 组空／参考 patch 校准、5 次无网络插件启动、工程自检及两项源码回放；不计入模型成功次数。facts 的观察请求数和时间更高，本轮不宣称效率或成本优势。

完整结果在被忽略的 `comparison-7aa997f/results.json`、`summary-incremental.json` 与逐任务原始 patch／grader 收据；正结果审计为 `audit.json`。`final-provenance.json` 另核对 10 个唯一 task/arm 组合、所有实际返回身份、experiment 指纹以及插件、native、loader、gateway、adapter 字节未变。controller 正常退出后 `docker ps -a` 为空，没有残留评测容器。

本轮生成的下一轮清单为 `comparison-7aa997f/next-selection.json`，SHA256 `241a326d5d48599d348c9342a11d8afe02532a3ff3fc674b5e57b386e539b320`；它绑定本轮汇总 SHA256 `068389e25d8dd7502ac7ef20e5f9db949a2918d3497a9de973ed10fe29aa1fd0`。以这两份实际文件执行 `--dry-run` 成功，仍为 5 项／10 次执行／25 项历史跳过；本轮没有启动下一次付费实验。

裁决：局部检索的机制修复、边界验证及审查修复已经完成；真实模型流程仍无有效事实包，原计划要求的两个不同任务完整增益链未满足。probe/recovery 继续不实施，默认 existing 保持。后续最小工作应先区分选择超时、请求范围和检索拒绝的实际原因，再决定是否继续局部定位；不增加调用次数、不自动重跑失败任务、不扩展通用平台。

采用可选局部范围而非放宽全仓库限额，是为了使指定源码可在既有资源限制内读取；代价是旁路必须做出明确范围选择。独立审查指出的目录成员过期和诊断存储阻塞已分别以失败回归修复；更极端的既有文件系统调度保证及真实费用仍是未知，未用本轮结果认证。
