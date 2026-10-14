# Flash 定位诊断改进：回归交付

2026-10-15 06:42 CST，固定快速回归 4/4 和原失败／未知并集 24/24 全部结束并审计。完整开发回归中 existing 与 facts 均为 **7 通过、5 失败、0 未知／12 题**；两组各一次。实际事实包、来源事实投递和可归因的主模型动作改变均为 **0**。本次交付证明诊断原因可观察，没有证明监督质量、成本或延迟收益。

本次核心实现是固定检索拒绝原因码、阶段／旁路耗时，以及截止时间和取消原因的保真；源码冻结于 `6bc994686b9aa465087d38821556611ddf0e7479`。实现和 RED→GREEN 证据见[诊断记录](2026-10-15-facts-diagnostics.md)，原完整 Flash 基线见[基线报告](2026-10-15-glm53-flash-results.md)。保留 `codex/facts-delivery` 分支与隔离工作树，没有合并、推送或启用 probe/recovery。本次已授权改进与回归到此交付，不继续追加模型实验。

## 冻结范围与审计

- 主模型和所有旁路均为 `zhipu/glm-5.3-flash`，实际网关请求／返回标签核对一致；没有更强 fallback。模型身份的证据是供应商／网关实际记录，不是对模型内部实现的独立认证。
- 两阶段均使用同一新冻结 plugin/runtime、原生 Claude 2.1.295、Linux Node 22.23.3 和 GNU loader；adapter 与父基线、选择文件、模型、预算均绑定 SHA。
- Linux Docker VM 10 CPU、实测内存 12,526,370,816 bytes，配置 12 GiB／swap 1 GiB；每题 1 CPU／4 GiB。主 agent 与官方评分分别有原定 3,000,000 ms 时限；原旁路两次调用／4,000 输出 token／30 秒活动预算保持。SDK 额外 thinking 的外部 token 硬上限及完整费用仍不能认证。
- 原 60 次基线及其所有冻结文件不覆盖。新增结果根为 `eval/results/facts-diagnostics-flash/`；其中 quick 与 incremental 分开保存，官方 fixtures、原回执、日志、candidate patch 和验收输出均保留，不提交进 Git。
- 2026-10-15 06:52 CST 收尾时重新运行两阶段 `audit.mjs`：4 和 24 份回执全部通过完整性检查；4 和 14 个成功结果分别核对官方必需测试、patch SHA、镜像／base、readiness 控制、逐题与聚合结果一致性。不是只看 verifier 退出码。
- `node scripts/check.mjs` 收尾重跑退出 0：manifest／TypeScript、155 个宿主测试、真实只读／局部事实／进程隔离、九组 scorer 和九组 SWE adapter 检查通过。这些免费检查证明机制，不替代真实模型收益。

父完整汇总字节 SHA：`6c5bb04cfcbe22eaef00b819a4b6ab87a0d882444bb944e8b79182f0576ba063`。

| 新回归 | experiment 指纹 | summary 字节 SHA |
| --- | --- | --- |
| quick4 | `1e5a65895efa556064a0ed2917edf66f66ca416fc908ddbdbacb8922155c3f8c` | `371dedceca99b5bb0bef31d2d79eca488008ef9acd52f998a9c05980edc6d4fc` |
| incremental24 | `7ba8c339ff447c96002445eabbe922d4259fa0e5b817596eeb9968fb8e415583` | `f3512dc20f8cb3c73822d4d5a128d3e7aeed3ffcde5af4c14fb3d76ed44749c7` |

experiment 指纹使用配置对象的规范序列化；恢复时另核对原文件字节 SHA，不能混用两者。`metrics.py` 只读取既有结果和原始轨迹，输出独立 `metrics.json`，不发起模型或重跑任务。

## 快速与完整失败并集结果

快速集合固定 NodeBB 8ca65b0（父基线双通过）及 Ansible 42355d1（父基线双失败），各模式一次，共四次，全通过。NodeBB 每组 33 项、Ansible 每组 20 项官方必需测试通过。Ansible 双失败变成双通过，但 facts 无有效介入，不能归因于监督。快速结果没有缩减随后的原 12 题失败／未知并集。

完整回归配对结果如下；P／F／U 分别表示官方验收通过、失败、未知。父基线既有未知的限制仍保留，不追溯改写。

| 任务 | 父 existing / facts | 本次 existing / facts |
| --- | --- | --- |
| Ansible 42355d1 | F / F | P / P |
| Ansible d62496f | P / F | P / F |
| Element Web 4fec436 | F / P | P / P |
| Element Web 404c412 | P / U | P / P |
| Flipt c172805 | F / F | F / F |
| Teleport 2b15263 | F / P | P / P |
| OpenLibrary f3b26c2 | F / P | F / P |
| OpenLibrary b67138b | F / F | F / F |
| ProtonMail cba6ebb | P / U | P / P |
| ProtonMail e65cc5f | F / F | F / F |
| Qutebrowser c09e143 | F / F | P / P |
| Tutanota f3ffe17 | P / F | F / F |

本轮 6 题双通过、4 题双失败、1 题仅 existing 通过、1 题仅 facts 通过。相对这 12 题的父基线，existing 从 4P/8F 变为 7P/5F：4 个 F→P、1 个 P→F；facts 从 3P/7F/2U 变为 7P/5F：2 个 F→P、2 个 U→P，没有原通过变失败。单次重复、缺少有效事实介入、供应商拒绝和两段调度条件都限制解释，不能将这些变化称为功能增益。

existing 两个 agent 达到时限，facts 一个达到时限；Teleport 两组对捕获的部分 patch 独立验收通过，OpenLibrary b67138b existing 的部分 patch 验收失败。通过表示捕获 patch 通过官方检查，不表示 agent 自然完成。没有人为取消或自动重试质量失败。

原完整基线中 18 题双通过没有进入本次完整回归；其中 NodeBB 只在 quick 中重测。不能拼接历史跳过结果，报告一个“新 30 题通过率”。

`incremental/next-selection.json` 根据本次完整汇总生成并使用真实 `selectRegression` 再验证：下一候选失败并集是 Ansible d62496f、Flipt、OpenLibrary 两题、ProtonMail e65cc5f、Tutanota，共 6 题／两组 12 次。它只保留将来可能开发时的选择证据，**本次不启动**。快速集合仍绑定原完整基线的固定两题，不从这次 quick 的双通过反推失败集合。

## 定位为什么仍未投递

| 阶段 | quick | incremental |
| --- | --- | --- |
| selection / deadline | 1 | 6 |
| inspection / source-missing | 0 | 2 |
| inspection / file-limit | 1 | 1 |
| 未观察到 FACTS_JOB | 0 | 3 |
| ASSIST context-returned / SourceFact 投递 | 0 / 0 | 0 / 0 |

完整回归六次 selection 在 30,014–30,086 ms 以 deadline 结束。两次 source-missing 分别为 Element Web 404c412 和 Ansible 42355d1；一次 file-limit 为 ProtonMail cba6ebb。三条没有 FACTS_JOB 的 facts 轨迹是 Teleport、Element Web 4fec436 和 Flipt，不能把“未观察到任务”当作完成检索或成功投递。

九条 FACTS_JOB 对应九次旁路调用：6 unknown、3 answered。answered 只表示供应商回答了 selector；文件检查随后合法拒绝，不等于事实可用。existing 则记录 19 次旁路调用，全为 unknown。具体固定原因、活动耗时与有效剩余时间已保留在 `audit.json` 的 stages／calls 中，无需复制回复、thinking 或敏感路径到报告。

逐条核对 28 次的 agent debug 中 `ASSIST` 事件及 `delivery: context-returned`，与所有 result 的 factsReturned 相互一致，均为零。没有 SourceFact，后续“主模型依据事实改变动作 → 独立验收”的链条无法成立，因果链计数为 0。Task 2 probe、Task 3 recovery 继续关闭。

额外从 Router 恢复的三个 selector 在同一 pinned image base 上免费只读重放，已说明旧 OpenLibrary 文件数超限、旧 Qutebrowser 缺文件、新 quick Ansible 范围包含 375,893-byte 配置超过 256 KiB。原临时工作区版本没有重建，另三条旧请求无匹配；这些只能证明可复现的拒绝机制，不是逐字节历史重放。详见[复现边界](2026-10-15-facts-diagnostics.md)。本轮未发现应通过放宽安全限制或增加 retry 来修复的最小核心错误；先交付明确阻碍，停止本次试验。

## 用量、开销与调度限制

下表是网关能观察到的 token **下界**，不是完整计费量。旁路事件的计数与耗时单列，不把其 token 再加到网关量，避免重复计算。未知调用中记录为 0 的 usage 不代表供应商未消耗 token。

| 阶段／模式 | 完整 usage 回执 | input 下界 | output 下界 | cache-read 下界 | 回执请求数 | 旁路次数／记录耗时 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| quick existing | 0/2 | 872,947 | 74,311 | 11,066,880 | 230 | 3 / 49.397 s |
| quick facts | 1/2 | 724,249 | 83,554 | 11,085,824 | 229 | 2 / 55.752 s |
| incremental existing | 1/12 | 4,389,003 | 595,649 | 55,990,144 | 1,184 | 19 / 285.528 s |
| incremental facts | 4/12 | 5,883,487 | 661,100 | 72,744,448 | 1,350 | 9 / 239.457 s |

完整费用、失败／取消请求计费、每成功任务费用均为 **unknown**。不依据 token 下界、Coding Plan 额度或不存在的价格证明省钱。未购买额度、未使用更强 fallback。

| 调度阶段 | 绑定回执数 | 新许可上限／实际派发 | 最小 MemAvailable | 最大 swap 使用 | agent 中位分钟 existing / facts |
| --- | ---: | --- | ---: | ---: | --- |
| quick | 4 | 许可 6→8；只有四个固定任务 | 8,295,215,104 B | 0 B | 30.49 / 21.87 |
| incremental 原阶段 | 9 | 许可 6→8；实际按许可逐题派发 | 5,150,752,768 B | 0 B | 32.01 / 20.82 |
| incremental 供应商限制后 | 15 | 最大配置仍 8，实际许可最多 4 | 5,324,316,672 B | 194,899,968 B | 17.62 / 31.53 |

分阶段任务不同且组数不平衡；上表不是相同任务的延迟对照。完整 12 题混合阶段 agent 中位分钟为 existing 24.81、facts 21.22，官方评分中位分钟为 2.70、2.53，同样不能归因于监督提速。总收尾包含 Teleport 长时间 Go 官方测试。

原阶段完整网关留有 9 条 HTTP 429；Router 留存的供应商内部拒绝固定 code 1302，表示并发限制，不是历史 1308 额度耗尽。两层记录计数不可混为一谈。19:27Z 只暂停新派发，原九次模型和评分自然结束；20:31:07Z 独占锁交接后恢复仅尚未派发的 15 次。9 份旧 result SHA 和 experiment 字节 SHA 在交接前后及最终指标中再次相同，paidAttemptsReplayed=0。历史失败／未知不删除、不重跑。

新许可控制器保持原内存、swap、过期暂停机制，实际最高 4；trace 保留新 issuer、helper SHA、逐题 lease SHA。两段 runner 均退出 0。4 并发阶段未观察到新网关非 200 响应，Router 交接后核查的 1,595 条记录全部为 Flash／200。全程 OOM 观察器未记录事件；结束时所有任务、评分和资源容器均已退出。内存充足也未越过供应商并发上限。

原基线的历史额度拒绝、两次早期切换导致的已接受响应取消、GLM-5.2 被上游转换的无效比较，都继续保留原限制；本次完成不追溯清除这些记录。

## 本次执行裁量与收尾

1. 复用已有 adaptive-eval 隔离工作树，保护原冻结基线与未提交文件；若隔离判断有误，代价是重新核对工作树隔离。
2. 依用户已授权的定位续做继续执行，没有另行请求设计批准；若范围判断有误，代价是回退本隔离分支的改动。
3. 先修诊断信息丢失，不猜测放宽超时／搜索范围；代价是一个有边界的诊断变更及已授权回归，没有承诺质量提升。
4. 不虚构缺失的历史检索原因。后续恢复了两条旧 selector，其余三条仍未知，固定 base 重放也不等于原临时工作区；代价是部分历史原因不能精确追溯。
5. 质量、完整费用和 thinking token 外部硬上限保留为真实模型门槛；代价是不能给出完整收益结论。
6. 原有通用错误日志与 awaited side-call journaling 未纳入这次最小诊断修复；代价是原日志行为仍可能需要独立处理。
7. 将供应商 1302 作为内存以外的准入约束，保留任务自然结束后只将新许可限制到四；代价是总耗时变长，必须保留两段调度和拒绝的混杂限制。

一次独立审查的两项 Important 已在同一轮修复中 RED→GREEN，并通过 155 个宿主测试及完整工程检查；没有未处理的 Critical／Important，没有 deferred minors，没有重复审查或追加付费实验。收尾只补结果与限制文档，不变更冻结产品源码。原始运行留在原结果目录；本计划的开发账本、RED／GREEN 日志、审查 diff 和只读 probe 证据逐文件核对后归档于同一结果根的 `development-evidence/`，不删除未备份证据或其他计划的文件。后续是否继续改进定位策略需单独确定范围。
