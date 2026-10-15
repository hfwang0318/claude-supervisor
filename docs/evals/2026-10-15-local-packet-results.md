# 局部事实包 Flash 验证结果

`934f705` 的六题失败／未知并集、两组共十二次，于 2026-10-15 13:09:32 CST 全部结束并完成审计。两组均 5 通过、1 失败、0 unknown。只有一个实际投递的事实包，且内容已出现在投递前同批 Read；有效“新增事实→改变动作→独立验收”链为 **0**，任务 1 尚未达标，任务 2／3 关闭。

## 范围与结果

父轮为 `facts-diagnostics-flash/incremental/summary-incremental.json`，源 SHA256 为 `f3512dc20f8cb3c73822d4d5a128d3e7aeed3ffcde5af4c14fb3d76ed44749c7`。本轮 experiment SHA256 为 `11808958da045ac64d33d16708c53d0d101c28456ecb88d28ab8891d73641714`。冻结源码、原生 CLI／Node／GNU loader、adapter、selection／父 summary、每次原回执、patch 和评分 patch 绑定全部通过复核。此处仅报告本轮六题，其他历史双通过题没有重测，不能合并为本版本 30 题成绩。

| 任务 | existing | facts | 官方必需测试数 | 实际事实包 |
| --- | --- | --- | ---: | ---: |
| Ansible d624 | 通过 | 通过 | 114 | 0 |
| Flipt c172 | 失败 | 通过 | 2 | 0 |
| OpenLibrary f3b | 通过 | 通过 | 52 | 0 |
| OpenLibrary b671 | 通过 | 通过 | 64 | 0 |
| ProtonMail e65 | 通过 | 失败 | 3 | 1（重复） |
| Tutanota f3ffe | 通过 | 通过 | 3 | 0 |

十个通过回执均逐项核对了全部官方必需测试，而非仅比较 parsedTests 数量。ProtonMail facts 只解析到 2/3 必需项，判失败；Flipt existing 未取得两个必需项，判失败。Tutanota facts 和 ProtonMail existing 的主模型达到原 3,000 秒上限后，终止主模型及子进程、保留原部分 patch，再由独立官方测试验收通过；这两次不是主模型完整完成。无手动取消或质量失败重试。

相对父轮同六题，两组各有四项失败转通过、零通过转失败，但不能归因于监督。组间有四题双通过，Flipt 仅 facts 通过，ProtonMail 仅 existing 通过；没有双失败任务。Flipt 没有定位触发或事实包，不能把其通过视为旁路收益。

## 事实链审计

六个 facts 任务中，三个在模型选择阶段达到约 30 秒上限；OpenLibrary f3b 在 12,364ms 以 `secret-content` 拒绝；ProtonMail 在 10,698ms 准备信息包；Flipt 未触发定位。没有放宽安全边界、扩大预算或 fallback。

唯一 SourceFact 是 `elementsActions.ts:38` 的实际 `dispatch(retry(newRetry(...)))` 调用，包含原文／文件 hash／manifest／Binding。实际下一条主模型请求确实带有该信息包。但是同一请求中的前序 Read 已提供同一源码行，不能作为新增事实；也没有有效证据证明由此改变动作，且该 facts patch 官方失败。原始审计与元数据保存在 `eval/results/local-packet-flash/` 的 `proton-delivery-request-audit.json`、`all-trigger-replay.json`、`causal-audit.json`，不复制请求原体、thinking 或凭据。

三次选择超时只看到本地请求和 upstream-error，没有供应商完整回复。供应商内部耗时及缺失用量仍 unknown，不能断言全部由推理造成。正确的源码安全拒绝不通过扩大扫描或弱化脱敏解决。

## 用量、耗时与资源

以下仅为观察到的用量，不能作为完整消费或成本优势；existing 0/6、facts 3/6 的完整用量可确认。完整费用和每成功成本均 **unknown**。

| 组 | observed input | observed output | observed cache read | 主模型耗时中位数 | 独立评分总耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
| existing | 3,779,020 | 381,428 | 42,549,056 | 1,780.143 秒 | 750.120 秒 |
| facts | 3,141,217 | 360,858 | 49,466,112 | 1,714.264 秒 | 710.537 秒 |

主模型耗时包含初始化／原超时限制，不等于端到端延迟；一轮一次的这些数值不证明效率收益。Router 本阶段观察到 1,417 条实际返回，全部 Flash／HTTP200；本地 1,434 个请求全部请求 `zhipu/glm-5.3-flash`，13 个 upstream-error 不按零消耗处理。完整原始事件保留。

Docker VM 为 12GiB／10 CPU／1GiB swap，单题 1 CPU／4GiB，实际准入最多 4，未提高供应商并发。1,409 个有效资源样本中最低可用内存 7,680,237,568 字节、最高 swap 使用 0，观察到 OOM 事件 0。本轮没有 429 或额度购买；旧基线的历史额度拒绝、两次早期切换取消及 diagnostics 的分阶段并发限制仍保留，不能因本轮正常而撤销旧限制。

## 后续两项修复的边界

`af314e2` 修复成功项目 Read 中已有调用者仍重复触发的问题；`f22ac88` 修复三候选与两词查询上限不匹配、导致明确局部范围退回选择器的问题。两项均先失败复现再修复；全普通检查现为 169 个宿主测试及其余工程检查通过，真实请求规范化免费回放与 pinned base 只读检索已核对。

这两项不在本轮冻结 `934f705` 中，不能把本轮结果作为它们的真实模型验收。最新完整轮次仅剩 Flipt／ProtonMail 两题的失败并集，共四次；没有合法 quick 双失败候选，不抽替代题，也不沿用旧父轮重新抽样。后续若验证这些具体修复，只使用新冻结版本、新输出目录和该完整并集，不重跑本轮回执或历史双通过题。即使后续全部功能通过，仍须独立审计新增事实及主模型动作，不能自动认定任务 1 达标。
