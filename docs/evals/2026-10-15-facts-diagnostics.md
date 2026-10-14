# 定位事实中止原因续做

范围：继续既定 Task 1，先解决真实 Flash 轨迹无法辨认中止原因的问题；不放宽检索／旁路预算，不开启 probe／recovery。父基线见[60 次交付报告](2026-10-15-glm53-flash-results.md)。

## 已复现问题与最小修复

旧基线 20 个事实任务中，15 次停在 selection、5 次停在 inspection，日志只有阶段和 unknown。实际的文件缺失、全仓库遍历超过 200 条目、秘密引文、返回超限、截止时间耗尽，在宿主和 hook 边界都折叠为同一空 FactView。无法从旧回执准确反推请求或单个具体拒绝条件；五次快速检索结束也不足以排除选择已用尽大部分预算。

先用真实小文件和宿主进程做对照：macOS 与固定 Linux Node／Claude 运行时均能经 `$.process.run` 的 stdin 得到完整 scoped FactView，不支持“服务接口普遍失效”的假设。此对照没有调用模型、没有改变原基线 runtime，也不等价于基线五条请求的重放。

最小改动为可审计原因：只读 inspector 返回固定 `failureReason`，hook 丢弃不完整视图中的全部事实并只放行已知原因码；非法码降为 inspection-unknown。`FACTS_JOB` 保留原 stage/result，增加固定 reason、elapsedMs、remainingMs；`SIDE_CALL` 增加固定 provider-error/provider-unanswered/output-limit 原因、调用耗时和有效 timeout。截止时间、取消、版本变化与服务错误分开记录。均不记录原始模型回复、请求路径或源码。

所有原安全、完整性、版本校验、一次任务／两次调用／4000 返回输出 token／30 秒预算保留。原因码用于下一轮诊断，不是正确性证书，不触发重试或自动扩大范围。SDK 额外 thinking 额度的外部 token 硬上限限制仍保留。

## 验证

- 五个新增宿主回归覆盖合法拒绝码、非法码不泄露、输出上限、服务异常不泄露、选择阶段截止时间耗尽。先在旧实现确认预期断言失败，再实现；155／155 宿主测试通过。
- 真文件检查区分 missing、file-limit、output-limit、secret-content、invalid-request、deadline、traversal-limit、no-facts；原 scoped 检索与来源重验检查仍通过。
- `node scripts/check.mjs`：manifest、TypeScript、155 个宿主测试、真实事实／局部事实／进程隔离、九组 scorer 与九组 SWE 适配器检查全部通过。
- 固定 linux/amd64 NodeBB 镜像、原 Linux Node 22.23.3／Claude 2.1.295、只读挂载、无网络、1 CPU／4 GiB 下，模型无关的真实宿主进程 scoped 检索退出 0。

这些是机制与诊断证据，尚未证明有效事实投递或质量收益。下一步使用新冻结 runtime，固定 NodeBB 8ca65b0 与 Ansible 42355d1，各两组一次；再保持完整 12 题失败／未知并集的开发回归。原回执不覆盖，费用缺失仍 unknown。

独立审查提出两项重要诊断问题：截止时间抛错误记 service-error，以及正常取消／off 先匹配 stale-binding。单次修复中先确认新增 deadline 异常与取消／off 断言失败，再让 Coordinator 传递固定中止原因，异常路径重验当前状态；155 个宿主测试及完整工程检查再次通过。没有未处理重要问题，也没有扩大模块范围。

补充原始网关对齐：按非流式、maxOutput=4048 的请求 ID 与 SIDE_CALL/FACTS_JOB 时间对照，14 个 selection unknown 在约 30 秒处以 upstream-error 结束（其中一次先有 429 后再中止），与 SDK 30 秒调用时限一致；另一个仅有三次 429 拒绝。五个 answered selector 的网关耗时为 18.56–26.295 秒。此对齐能定位多数选择中止的时间边界，仍不能恢复五个检索请求或断定具体检索拒绝条件。新版记录将区分 deadline 与固定检索原因。

回归冻结源码提交 `6bc9946`，独立 runtime／adapter／readiness 与新结果位于 `eval/results/facts-diagnostics-flash/`，父基线 SHA 保持绑定。快速四次通过完整审计后自动继续完整 24 次失败／未知并集；遇额度拒绝保留轨迹并在下一阶段前停止，不购买额度或重跑已接受回执。

新版 inspector 的两组真文件自测另在冻结 Linux Node v22.23.3 下完成，退出 0；只启动了无网络的轻量自测容器并已清理。快速回归于 2026-10-15 02:38 CST 启动，四个首轮任务同时运行，初始实际网关记录均为 Flash、未见 429；这些启动记录不代表任务已通过。

## 快速回归完成与额外检索复现

2026-10-15 03:14 CST，固定两题／四次全部通过，完整 quick audit 核对四份回执、模型身份、patch、runtime／adapter／父汇总绑定与官方必需测试。NodeBB 8ca65b0 两组继续通过；Ansible 42355d1 从父基线双失败变为本次双通过。两条 facts 轨迹仍未投递事实包（NodeBB selection deadline，Ansible inspection file-limit），所以不能把通过或变化归因于新增监督。快速结果不更新失败集合；单一控制器已继续原 12 题／24 次全量开发回归。

先前“旧请求缺失”只针对评测输出目录。额外检查发现 Router 的近期完整回执仍保留部分响应；通过网关请求时间、非流式 maxOutput=4048、输入／输出用量一一对齐，使用真实 parseFactRequest 验证并提取合法选择。仅保存规范化请求与原 body SHA，不复制原始回复、thinking 或凭据；恢复了两条旧基线选择及本次 Ansible 选择，另三条旧记录已无法匹配。

同一 pinned task image 的 base commit 上，使用原 inspector 加只读位置诊断、无网络、0.25 CPU／256 MiB 做三次免费重放：

| 选择 | 复现拒绝 | 具体观察 |
| --- | --- | --- |
| 旧 OpenLibrary fdbc0d8 | selected-file-limit | 三个检索范围内匹配的文件超过六个 |
| 旧 Qutebrowser a84ecfb | source-missing | 选择了不存在的 tests/unit/commands/test_cmdexc.py |
| 新 Ansible 42355d1 | file-limit | 范围 lib/ansible 包含 lib/ansible/config/ansible_builtin_runtime.yml，文件 375,893 bytes，超过 256 KiB |

原来工作的临时修改／全部版本没有重建，因此这三条是固定 base 上可重复的拒绝机制证据；不能据此宣称逐字节重放了旧工作区。Ansible 的结果与新版实际 file-limit 原因一致，问题在选择范围包含超限来源，不需要放宽安全限制。重放容器均清理，正在运行的模型未中断，原基线与新冻结 runtime 没有改动。暂不凭猜测增加重试或新模块；继续收集完整失败并集中的诊断、独立验收及真实用量。

## 供应商并发约束与保留回执续跑

完整失败并集开始后，8 并发出现供应商 429。Router 原始错误 body 的固定 code 为 1302（rate_limit_error／并发限制），与历史 1308 额度耗尽不同；原始拒绝和内部重试记录保留，不能把这些影响归为模型能力或费用为零。

2026-10-14 19:27Z，向唯一活动 monitor 发送 SIGUSR2，只停止新派发。此前已派发 9 次，已开始的模型与官方评分继续自然结束；没有取消任务、改变 runtime、重启 Docker、提高预算或购买额度。provider-resume.py 等待旧控制器释放独占锁并确认所有旧容器清理后，以同一 experiment／out／runtime／adapter／capacity 路径继续仅未派发项，保留所有已有通过、失败或未知回执。

配置上限仍为 8，但新签发许可的实际 admission 上限为 4，供应商约束优先于空闲内存。独立操作控制器保留原资源阈值与过期机制，trace 记录 helper SHA、provider cap、issuer 和每份许可 SHA。未改冻结 adapter；原 experiment 字节与已存在结果的 SHA 在续跑前后比较，延迟按这两段实际 admission 条件说明。

无 Docker／模型调用的控制器行为测试：配置最大 8，持续 17 秒高可用内存、低 swap 输入，四次发布均为 4，终止发布 0，退出 0；没有因空闲内存恢复到 8。等待与续跑状态分别写 provider-handoff-status.json 与 delivery-status.json。真实 1308 时停止进入剩余派发并等待恢复；不重跑已接受模型回执。

## 本轮交付完成

2026-10-15 06:42 CST，quick4 与 incremental24 已全部结束并审计。完整失败并集中两组均 7/12 通过、5/12 失败，0 事实包；6 个 selection deadline、2 个 inspection source-missing、1 个 file-limit，另 3 条 facts 轨迹未观察到 FACTS_JOB。原九份回执和 experiment 字节未变，四并发续跑未新增网关 429，0 付费重跑、0 人为取消、未观察到 OOM。收尾重新核对两阶段审计、155 个宿主测试与全部工程检查。结果、配对变化、费用 unknown、阶段调度和历史限制详见[完整回归交付报告](2026-10-15-facts-diagnostics-results.md)。本次授权范围结束，probe/recovery 继续关闭，不自动启动下一轮。
