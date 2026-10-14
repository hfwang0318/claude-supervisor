# GLM-5.2 新基线与开发回归

状态：实现及免费预检通过；尝试于北京时间 14:49 开始，15:14:55 停止。
用户在官方控制台发现流量为 GLM-5.3。官方 Coding Plan 规则确认 GLM-5.2 为会自动切换
至 GLM-5.3 的旧名称；因此本轮不能建立 GLM-5.2 基线，付费 runner 已在运行前阻止该配置。

用户要求：主模型和审查／旁路模型均使用费用更低的 GLM-5.2，以监督能力效果为比较目标；
切换模型后重测全部既定数据，建立独立新基线。此处全部数据指现有冻结的 30 题项目子集
（20 development／10 holdout，含原 6 smoke），两组 existing／facts 各一次，共 60 次。
旧 GLM-5.3 基线及失败集合保留为历史，不用它们选择新模型的首次测量。

## 固定条件

- 主模型、所有宿主角色别名、插件 verifier_model、网关请求：`zhipu/glm-5.2`。
  原先只要求返回身份为 `glm-5.2` 或同一显式带 provider 名，此检查不足以证明实际执行模型。
  智谱套餐会在上游转换旧名称；本地 fallback off 不能阻止供应商转换。后续需同时核对
  供应商路由政策及控制台归属，禁止把兼容名称／回显当作实际模型证明。
- 冻结原 30 题清单、原始需求／base commit／官方测试材料和 digest-pinned images。
  新运行时使用统一 GNU loader 包装，同一 Claude Code 2.1.295／Linux Node 22.23.3。
- 两组只改变 assistance_mode；保留局部事实增强及现有预算。execution_mode off，
  probe／recovery 不启用；不根据结果临时改模型、提示词、预算或测试。
- seed 53，一次／组，最多两个 worker；各 1 CPU／4096 MiB，agent／grader 各 50 分钟。
  无自动付费重试。模型只见需求与干净仓库，hidden tests／gold 在独立评分侧。
- 已 hash 绑定且通过的模型无关环境校准可复用；它不算本轮模型结果。
  patch 在全新容器独立评分；先销毁 worker，再开始 grader。
- 费用及缺失 usage 保留 unknown；实际 provider token／金额上限不由客户端预算证明。
  一次 30 题测量不等于官方 642 题分数，也不能证明统计显著性。

## 后续回归

完整基线生成 `summary-baseline.json`，绑定 manifest、experiment、主／旁路身份。
`failure-selection.json` 是任一组失败或未知的并集，两组各跑一次。此后称为开发全量回归，
指当前失败集合全量；完成后由同轮结果生成 `next-selection.json`。跳过项只标记历史通过，
不声称新增能力版本仍通过。基线 hash／模型身份不匹配、重复任务、遗漏并集均拒绝执行。

`quick-selection.json` 从完整 GLM-5.2 基线按冻结 manifest 顺序取首个双通过和首个双失败任务，
固定两题／四次。若任一类别不存在，保存 null 并报告快速回归不可用，不替换为未知。
快速结果使用 `summary-quick.json`，不能作为下一轮失败集合依据。

以下均先用 `--dry-run` 免费核对范围；实际运行去掉该开关并指定全新 `--out`，以及
相同固定任务材料、当次新冻结 runtime、readiness。基线初始化不传 selection 参数。

```sh
node eval/swe-pro/run.mjs --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm52/baseline/failure-selection.json --baseline-summary eval/results/swe-pro-glm52/baseline/summary-baseline.json --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm52/baseline/quick-selection.json --baseline-summary eval/results/swe-pro-glm52/baseline/summary-baseline.json --dry-run
```

## 验证与结果

完整免费 `node scripts/check.mjs` 通过 149 host tests、类型／manifest、真实事实及隔离检查、
全部 scorer 自测和 6 组 SWE Pro 自测。30/30 离线 plugin startup 通过。独立审查发现的
全量重复任务晚拒绝已由 RED→GREEN 回归修正。实现冻结提交 `025773b`。

付费尝试仅有 4/60 收据：facts 2 项独立评分通过（均 0 个事实包）；existing 2 项由主动停止
保留未知。其余 56 项没有尝试，没有完整基线／回归选择文件。所有结果均为不符合指定真实
模型要求的诊断材料，不能作为 GLM-5.2 得分或监督收益证据。容器全部清理，无自动重试。

本机 Router 截至 15:12 的 167 条已完成日志，其 requested／resolved／response／usage 标签
都为 GLM-5.2；用户提供的官方 Coding Plan 用量页归属为 GLM-5.3。官方[套餐概览](https://docs.bigmodel.cn/cn/coding-plan/overview)
明确说明历史 GLM-5.2／5.1 请求自动切换 GLM-5.3，解释了两层记录差异。
此前仅凭回显字段确认“实际模型是 GLM-5.2”的判断已撤回。

当前阻止 paid execution，免费 `--dry-run` 仍可检查任务范围。继续需要选用套餐当前真实提供
的 GLM-5.3-Flash（官方积分系数为 GLM-5.3 的三分之一，实际总成本仍须测量），或者提供
实际服务 GLM-5.2 的独立 API 通道。不会自行改选其他模型或购买／启用新的计费通道。

原始轨迹／用量／patch／评分、`model-route-audit.json`、`router-model-audit.json` 及
`invalidated-baseline.json` 均保留在被忽略的 `eval/results/swe-pro-glm52/`。
