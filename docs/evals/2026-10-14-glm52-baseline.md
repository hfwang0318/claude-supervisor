# GLM-5.2 新基线与开发回归

状态：实现及免费预检进行中，尚未建立完整模型基线。

用户要求：主模型和审查／旁路模型均使用费用更低的 GLM-5.2，以监督能力效果为比较目标；
切换模型后重测全部既定数据，建立独立新基线。此处全部数据指现有冻结的 30 题项目子集
（20 development／10 holdout，含原 6 smoke），两组 existing／facts 各一次，共 60 次。
旧 GLM-5.3 基线及失败集合保留为历史，不用它们选择新模型的首次测量。

## 固定条件

- 主模型、所有宿主角色别名、插件 verifier_model、网关请求：`zhipu/glm-5.2`。
  真实返回身份必须为 `glm-5.2` 或同一显式带 provider 名；禁止其他模型兜底。
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

待免费完整检查、30 题离线预检、60 次独立结果及作用链审计完成后填写；不得将运行开始
或机制自测标记为模型基线完成。原始轨迹／用量／patch／评分收据保存在被忽略的
`eval/results/swe-pro-glm52/`。
