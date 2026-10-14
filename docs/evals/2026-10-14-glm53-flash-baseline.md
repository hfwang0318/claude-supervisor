# GLM-5.3-Flash 新基线与开发回归

状态：用户已选择主模型／审查模型均为 GLM-5.3-Flash；实现与免费检查进行中，尚无完整模型基线。

## 目的与模型身份

只比较监督效果，使用同一费用较低的模型作为主模型 M 与旁路 S，S=M。
请求固定为 `zhipu/glm-5.3-flash`，真实返回标签仅接受 `glm-5.3-flash` 或同一显式 provider 名。
所有 Claude 角色别名、worker 和冻结插件 verifier_model 均一致；网关拒绝 GLM-5.3 等其他模型。

身份不能只依赖响应回显：智谱[官方套餐概览](https://docs.bigmodel.cn/cn/coding-plan/overview)
于 2026-10-14 核对，列明实际支持 GLM-5.3／GLM-5.3-Flash，并将旧 GLM-5.2／5.1 自动升级到 GLM-5.3。
评测启动前人工核对官方政策、最小 API 请求／响应和本机 Router 访问／用量归属；实验配置锁定政策来源。
运行前守卫校验这一已核对的政策快照，不会自行联网更新政策，也不能独立认证供应商的模型权重。
旧名称在运行前拒绝；不做强模型 fallback。此前的[无效 GLM-5.2 尝试](2026-10-14-glm52-baseline.md)
保持原样，模型结果不进入新基线。其模型无关、hash 绑定的环境控制和运行时素材可复用。

Flash 官方输入／缓存／输出积分系数为 2.3／0.56／8；GLM-5.3 为 6.9／1.7／24。
系数约三分之一，不等于实测总开销降低三分之二；请求量、失败、延迟、缓存、完整用量和总费用需要分开报告。
缺失 usage／账单保留 unknown，不能把失败调用记为免费。

## 冻结范围与执行

完整重测原冻结 30 题（20 development／10 holdout，含原 6 smoke），existing／facts 各一次，共 60 次。
不是官方 642 题全榜。清单 SHA256：`1d3260043ef0589d44483bc46243e4331233bb13b2952cf71e92cb228eb0d628`。
原始需求、base commit、300 份任务材料、官方 tests／gold SHA256 及镜像 digest 都保持。
两组只改变 assistance_mode，保留局部事实能力和现有监督预算；execution_mode off，probe／recovery 不启用。

统一 Claude Code 2.1.295、Linux Node 22.23.3 及 GNU loader 包装；seed 53、default reasoning。
最多两个 worker，各 1 CPU／4096 MiB；agent／独立 grader 各 50 分钟，无自动付费任务重试。
agent 只见原始 instruction 和干净仓库、隔离配置、无 MCP／web／其他 agent 工具、仅模型网关 egress。
完整捕获相对不可变 base 的 patch（含模型自行提交的改动），销毁 worker 后在全新评分容器重放。
成功需 hash 绑定的空 patch／参考 patch 校准及官方全部必需测试通过；环境错误保留 unknown。

输出在独立目录 `eval/results/swe-pro-glm53-flash/`，原始轨迹／patch／日志不提交。
代码、runtime、模型政策、image／grader、调度与结果绑定到同一 experiment SHA256。
一轮单次测量不能证明统计显著优势；监督收益需要实际新证据、改变的主模型动作和独立验收。

## 后续回归规则

完成后生成 `baseline/summary-baseline.json`，以及绑定其字节 hash 的两类选择文件：

- `failure-selection.json`：任一组失败或未知的并集，两组各一次。以后开发“全量回归”是此集合全量；
  完成后以同轮结果生成 `next-selection.json`。历史双通过项跳过，不能算作新版得分。
- `quick-selection.json`：按冻结清单顺序固定首个双通过和首个双失败任务，共两题／四次。
  若任一类别不存在，保存 null 并报告 unavailable，不用未知凑数。`summary-quick.json` 不能缩减失败集合。

范围可先免费预览。实际运行去掉 `--dry-run` 并指定本轮新冻结 runtime、固定任务目录、readiness 与全新 out。
切换模型后首次建立完整基线不传 selection 参数；旧 GLM-5.3／GLM-5.2 请求标签的基线不能混用。

```sh
node eval/swe-pro/run.mjs --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm53-flash/baseline/failure-selection.json --baseline-summary eval/results/swe-pro-glm53-flash/baseline/summary-baseline.json --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm53-flash/baseline/quick-selection.json --baseline-summary eval/results/swe-pro-glm53-flash/baseline/summary-baseline.json --dry-run
```

## 验证与结果

待模型基线完整结束后填写。不得将免费机制检查或运行开始标记为基线完成。
