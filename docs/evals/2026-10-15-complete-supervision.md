# 综合工程审查：能力实现与验证记录

用户已明确改为先补齐核心能力、再统一观察模型行为与效果。该阶段在隔离 `codex/facts-delivery` 开发；默认 existing 不变。旧事实轮次不作为综合模式的效果验证。

## 研究到可运行路径

能力选择依据[研究第4—7节](../research/2026-10-11-capabilities-and-model-gap.md)及[修订设计](../superpowers/specs/2026-10-15-complete-supervision-design.md)。研究是可检验方向，不证明一个同等或更弱旁路已经具备可靠架构判断。

| 过程能力 | 实际调用与约束 | 普通行为验证 |
| --- | --- | --- |
| 需求—方案一致性 | `review.ts` 来源化 req／显式 plan，缺方案不允许声称已审；宿主在编辑前适时触发 | review／review-host：真实引用、遗漏方案、需求冲突反馈 |
| 方案—实现一致性 | plan＋bounded change 必须共同被引用，记录检查后进入实现审查 | review／review-host：缺改动引用拒绝、方案后实现共享预算 |
| 架构与关键方向 | 职责、依赖、生命周期、兼容性、复杂度；continue／adjust／replan／gather-evidence，可无命令反馈 | review／review-flow／review-host：架构与方向意见有真实反馈路径，continue 不强行干预 |
| 定位与方案依据 | 同一 review-flow 选择安全 inspector，最多6文件／2词，反馈前重验 source manifest | review-flow、真实 scoped-facts：正确原文及来源过期丢弃；拒绝保持 unknown |
| 探索／反例 | 有需求来源的 ProbeCandidate，最多3候选文件；off 明确未执行，enabled 仅已验证副本 | probes／review-flow／review-host、真实 workspace：来源、危险命令、隔离、清理、过期及假设标签 |
| 反馈／恢复 | 三次近期真实同命令同错误，引用实际观察；每提示一次恢复，不编造已排除原因 | recovery／review-host：成功或不同错误不强恢复、来源不符拒绝、无重复恢复循环 |
| 验证／完成 | 实际最终回答与近期检查作为不同来源，最多一次语义完成反馈；不认证全项目正确 | review／review-host：最终回答可见、验证意见反馈、Stop有界、shadow不投递 |

统一入口 `supervise` 只用一个审查协议，不为每维度各调用一个模型；最多一个重要判断和一种补证据行动。定位、复现、恢复是判断的支撑工具。`probe`／`recovery` 可单独筛查；原 facts 路径及默认 existing 保留。

## 边界与可观测性

每真实用户提示共用 2 次旁路调用／4000 输出 token／30 秒活动预算；关闭、取消和模型切换不补预算。新提示、工具记录变化、模型切换、关闭、取消使旧反馈失效。基于模型生成的反例预期永远保留 hypothesis，缺依赖／错误环境／截断和超时不算行为缺陷证明。当前 Linux 没有独立副本执行能力，综合模式返回未执行建议；不得在真实项目执行旁路代码。

`REVIEW` 是已解析判断、源ID、Binding、维度与未审范围／行动／原因；不是原始模型回复或 thinking。`REVIEW_DELIVERY` 只记录上下文返回或实际提交，消费仍 unknown。评测回执分别记录实际 `assistanceMode`、维度和行动次数。建议正确性、主模型是否改变决策、独立验收与收益默认 unknown，必须审实际轨迹。

SWE Pro 使用显式 `--experimental-mode supervise`。为兼容旧失败并集选择器，磁盘／schedule 的实验槽仍名为 `facts`，但新 runtime `armModes.facts`、experiment、agent-receipt 和 result 的 `assistanceMode` 均绑定 `supervise`，运行前核对插件实际配置。缺失或冲突回执拒绝；旧 runtime 默认仍映射 existing/facts。跨模式父轮明确标注，旧 facts 成绩不转称 supervise 成绩。

## 验证与真实效果的区别

普通检查命令固定 `node scripts/check.mjs`，覆盖所有宿主测试、manifest、TypeScript、真实只读源码／workspace进程隔离、全部 scorer、模式／选择／续跑／容量自检。新 `eval/selftest-review.mjs` 使用假二进制与免费 dry-run 核对实际冻结模式、错误模式拒绝、回执及诊断指标，不发模型请求。具体整体验证和审查结论在本阶段进度 ledger／最终交付中记录。

真实模型收益尚未验证。用户最新要求本次只对一个双失败任务做行为观察，检查审查输入／输出与调用／投递是否正常，不以帮助主模型通过测试为验收目标，不叠加完整回归。不因本地测试通过就认定模型能正确审查全部维度。日常 quick 只从最新完整轮次双失败任务固定seed随机一题，两组各一次；完整验证取最新完整轮次失败／未知并集两组。全部普通测试不缩减。完整主／旁路用量及价格缺失时费用 unknown；必须同时报告错误意见、返工和未介入任务。

## 前一轮 caller-scope 结果归档

`f22ac88` 的 `eval/results/caller-scope-flash` 已于 2026-10-15 06:10:28Z 完成 4/4 并审计，两组各0通过2失败0未知，0事实包、0有效链。它验证的是旧 facts 修复，不包含综合审查能力。

- Flipt existing：调用不存在的 `ParseYAML`，编译失败。
- Flipt facts：必需 fixtures 缺失，官方测试实际执行并失败；原 `failedBeforeTests` 标记与实际评分轨迹不一致，不能据标记称测试没跑。
- Proton 两组均只取得2/3必需项，官方失败；existing达到原主模型时限、facts主模型正常结束。facts 一次本地源码检索 source-missing 573ms、无旁路模型调用；具体缺失路径尚未从真实宿主输入复现，不能凭带系统附加文本的规范化请求推断原因。

本地记录496个Flash请求、493个实际Flash/HTTP200返回、3个upstream-error。existing完整用量0/2、facts2/2；观察量不是完整账单，费用及每成功费用 unknown。613资源样本最低可用6,604,726,272字节、swap0、观察到OOM0。所有旧控制器和评测容器已退出。原回执、完成hash、final-metrics、causal-audit保持，不重复已有模型试验。

更早基线60次、diagnostics quick4/full24、local-scope quick2、local-packet full12及历史额度／早期取消／并发阶段限制继续保留。旧0链门槛已经被用户取消为开发前置条件，仍不能虚构事实或综合审查收益。


## 整体独立审查与修复

一次 fresh review 覆盖本次能力阶段 `a38b828..26392ac`，提出6项 Important、0 Critical，无需额外样式修复。已集中以失败测试复现后修复：否定／引用的方案词不构造 plan；观察保留退出码、stderr、截断与完成状态；缺失较新观察或通过输出不构造重复失败；清理及投递前验证计入同一在途行动／30秒预算；预算／协议／材料跳过记录有界、去重、分阶段未审原因；综合判断反馈不计作旧事实包。源码补充事实按实际投递的选中ID另计。

修复后 `node scripts/check.mjs` 完整通过：215项宿主测试、manifest、TypeScript、真实只读／范围检索／workspace隔离及全部scorer、SWE Pro评测机制检查。该结果是机制验证，不是真实审查质量证明；后续代码采用作者TDD验证，不伪称审查者重审过最终修改。

用户最新要求本轮真实模型只观察行为。已从最新完整 caller-scope 双失败中以固定seed `bdfea61f487625f6804b93d1babef504` 抽中ProtonMail e65，existing／supervise各一次，不重抽，不叠加full。两组显式 `--task-timeout-ms 900000`（15分钟主模型观察窗口，旁路预算不变），区别于旧3000秒完整求解上限；到时保留轨迹和部分patch，不要求官方通过。报告重点是触发、输入来源／输出协议、建议与行动、投递进入主请求及预算正常性，官方成绩只描述。
