# 定位事实中止原因续做

范围：继续既定 Task 1，先解决真实 Flash 轨迹无法辨认中止原因的问题；不放宽检索／旁路预算，不开启 probe／recovery。父基线见[60 次交付报告](2026-10-15-glm53-flash-results.md)。

## 已复现问题与最小修复

旧基线 20 个事实任务中，15 次停在 selection、5 次停在 inspection，日志只有阶段和 unknown。实际的文件缺失、全仓库遍历超过 200 条目、秘密引文、返回超限、截止时间耗尽，在宿主和 hook 边界都折叠为同一空 FactView。无法从旧回执准确反推请求或单个具体拒绝条件；五次快速检索结束也不足以排除选择已用尽大部分预算。

先用真实小文件和宿主进程做对照：macOS 与固定 Linux Node／Claude 运行时均能经 `$.process.run` 的 stdin 得到完整 scoped FactView，不支持“服务接口普遍失效”的假设。此对照没有调用模型、没有改变原基线 runtime，也不等价于基线五条请求的重放。

最小改动为可审计原因：只读 inspector 返回固定 `failureReason`，hook 丢弃不完整视图中的全部事实并只放行已知原因码；非法码降为 inspection-unknown。`FACTS_JOB` 保留原 stage/result，增加固定 reason、elapsedMs、remainingMs；`SIDE_CALL` 增加固定 provider-error/provider-unanswered/output-limit 原因、调用耗时和有效 timeout。截止时间、取消、版本变化与服务错误分开记录。均不记录原始模型回复、请求路径或源码。

所有原安全、完整性、版本校验、一次任务／两次调用／4000 返回输出 token／30 秒预算保留。原因码用于下一轮诊断，不是正确性证书，不触发重试或自动扩大范围。SDK 额外 thinking 额度的外部 token 硬上限限制仍保留。

## 验证

- 五个新增宿主回归覆盖合法拒绝码、非法码不泄露、输出上限、服务异常不泄露、选择阶段截止时间耗尽。先在旧实现确认预期断言失败，再实现；154／154 宿主测试通过。
- 真文件检查区分 missing、file-limit、output-limit、secret-content、invalid-request、deadline、traversal-limit、no-facts；原 scoped 检索与来源重验检查仍通过。
- `node scripts/check.mjs`：manifest、TypeScript、154 个宿主测试、真实事实／局部事实／进程隔离、九组 scorer 与九组 SWE 适配器检查全部通过。
- 固定 linux/amd64 NodeBB 镜像、原 Linux Node 22.23.3／Claude 2.1.295、只读挂载、无网络、1 CPU／4 GiB 下，模型无关的真实宿主进程 scoped 检索退出 0。

这些是机制与诊断证据，尚未证明有效事实投递或质量收益。下一步使用新冻结 runtime，固定 NodeBB 8ca65b0 与 Ansible 42355d1，各两组一次；再保持完整 12 题失败／未知并集的开发回归。原回执不覆盖，费用缺失仍 unknown。
