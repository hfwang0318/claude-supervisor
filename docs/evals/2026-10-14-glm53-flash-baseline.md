# GLM-5.3-Flash 新基线与开发回归

状态：主模型／审查模型均为 GLM-5.3-Flash；实现与免费检查已完成，完整模型基线执行中。

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
最初两个 worker，用户随后授权把剩余工作提高到四个，各 1 CPU／4096 MiB；agent／独立 grader 各 50 分钟，无自动付费任务重试。
agent 只见原始 instruction 和干净仓库、隔离配置、无 MCP／web／其他 agent 工具、仅模型网关 egress。
完整捕获相对不可变 base 的 patch（含模型自行提交的改动），销毁 worker 后在全新评分容器重放。
成功需 hash 绑定的空 patch／参考 patch 校准及官方全部必需测试通过；环境错误保留 unknown。

输出在独立目录 `eval/results/swe-pro-glm53-flash/`，原始轨迹／patch／日志不提交。
代码、runtime、模型政策、image／grader、调度与结果绑定到同一 experiment SHA256。
一轮单次测量不能证明统计显著优势；监督收益需要实际新证据、改变的主模型动作和独立验收。

## 后续回归规则

本轮最终汇总输出为 `baseline-adaptive/`，旧阶段保持原样。完成后生成 `summary-baseline.json`，以及绑定其字节 hash 的两类选择文件：

- `failure-selection.json`：任一组失败或未知的并集，两组各一次。以后开发“全量回归”是此集合全量；
  完成后以同轮结果生成 `next-selection.json`。历史双通过项跳过，不能算作新版得分。
- `quick-selection.json`：按冻结清单顺序固定首个双通过和首个双失败任务，共两题／四次。
  若任一类别不存在，保存 null 并报告 unavailable，不用未知凑数。`summary-quick.json` 不能缩减失败集合。

范围可先免费预览。实际运行去掉 `--dry-run` 并指定本轮新冻结 runtime、固定任务目录、readiness 与全新 out。
切换模型后首次建立完整基线不传 selection 参数；旧 GLM-5.3／GLM-5.2 请求标签的基线不能混用。

```sh
node eval/swe-pro/run.mjs --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm53-flash/baseline-adaptive/failure-selection.json --baseline-summary eval/results/swe-pro-glm53-flash/baseline-adaptive/summary-baseline.json --dry-run
node eval/swe-pro/run.mjs --selection eval/results/swe-pro-glm53-flash/baseline-adaptive/quick-selection.json --baseline-summary eval/results/swe-pro-glm53-flash/baseline-adaptive/summary-baseline.json --dry-run
```

## 验证与结果

`node scripts/check.mjs` 通过：149 个 host tests、类型／manifest 校验、真实进程隔离检查、各套 scorer self-tests 和 9 组 SWE 适配器检查。
30 题离线插件启动检查通过；30 题空 patch／官方参考 patch 的 hash 绑定校准及 300 份任务材料校验通过。
最小付费路由检查的请求、返回及 Router 访问／用量标签均为 Flash；64-token 请求仅有 thinking，256-token 请求返回 OK。
这些检查验证机制、环境与路由，完整模型结果仍待全部结束。

首轮因供应商五小时额度于 16:24–16:28 返回 429／1308，16:28:39 停止；供应商提示恢复时间为北京时间 17:12:38。
原始 `baseline/` 的 7 份记录保持不变。新的 `baseline-resumed/` 保留 4 份已独立评分记录，仅排除没有任何成功模型响应／补丁的 3 份基础设施尝试：
Element Web facts 全部为额度拒绝；Ansible／Vuls facts 在免费环境校准期间被中断，尚未启动模型。
18:46 在相同冻结配置下继续剩余 56 次首个有效尝试，已完成的通过／失败任务不重跑。
其中 OpenLibrary b671 existing 的失败 patch 已由官方测试评分，但 agent 曾收到 5 次额度拒绝，不能只归因于模型能力；原始记录及此限制单独保留。
额度拒绝调用的费用为 unknown。实验 fingerprint 为 `19420bcf3cc77abf03093c7d4de48cb884a2f8c5e052f6ca46ee5446af09de9d`。

用户指出 macOS 可以利用交换空间，并授权继续提高并发。实测宿主机 16 GiB、Docker 8.72 GiB／约 1 GiB VM swap；每任务上限仍为 4 GiB。
并发上限提高到 4，显式允许内存峰值超额配置并监测资源／OOM／供应商额度；不声称资源峰值已有保证。
切换时原阶段保留 22 次尝试（15 pass／5 fail／2 unknown），剩余 38 次在新阶段首次执行。
2 个未知为切换时取消的 Element Web 404c／ProtonMail cba6 facts：已有模型响应、未产生补丁，轨迹及空 patch 保留，不自动重跑或算作模型能力失败。
续跑校验原始 adapter hash，并逐字节验证执行、评分、网关及其他非调度模块不变；原始回执保留原 fingerprint／原路径，绑定到新配置。
仅并发和调度实现发生变化，不合并为单一配置下的延迟；汇总记录两阶段及其尝试数。
以下免费预览会验证来源，输出 inherited 22／planned 38，不调用模型或 Docker：

```sh
node eval/swe-pro/run.mjs --continue-from eval/results/swe-pro-glm53-flash/baseline-resumed --continue-adapter eval/results/swe-pro-glm53-flash/adapter-two-workers --out eval/results/swe-pro-glm53-flash/baseline-four-workers --jobs 4 --allow-memory-overcommit --dry-run
```

最终统计待模型基线完整结束后填写，不得将免费检查或部分模型结果标记为基线完成。

## 持续资源监测与自适应调度

继续使用固定 Linux 镜像与原有单题限制。当前 macOS Docker Desktop 4.87.0 的只读重启判断
确认增加 VM 内存／swap 需要重启；已开始的任务运行期间不应用这些设置。容器上限可热更新，但不会增大 VM。
用户随后明确授权：这些任务和评分全部结束后，Docker VM 从配置的 9 GiB 提高到 12 GiB，再执行剩余任务。
通过新阶段的 `--allow-vm-memory-change` 显式允许且只允许 VM 内存变化，记录实际前后 MemTotal／完整环境；
CPU、平台、模型、单题限制与评分不变。原回执保留原环境 fingerprint，不重跑已完成题目。

后续队列以六并发起步、八并发为上限，显式允许超额配置。`capacity-monitor.mjs` 管理 runner 和
64 MiB／0.1 CPU、无网络、只读探针，五秒读取一次 VM 可用内存和 swap。至少 4 GiB 可用且 swap
低于 256 MiB 才允许初始六并发；连续三次充裕采样提高一个并发。可用内存低于 1.5 GiB、swap
超过 512 MiB 或观测失败时暂停派发；已有工作继续。恢复从低并发逐步上调，不保证所有峰值都有空间。
许可 90 秒过期、缺失／损坏／超范围时默认零；原子发布，trace 与每题回执通过许可 SHA256 对齐。

新调度器的 `SIGUSR2` 可重复安全地停止新派发并等待已有任务完成；`SIGINT`／`SIGTERM` 保留显式取消。
旧四并发调度器不支持该信号，迁移只在模型和独立评分自然结束、剩余全为免费准备时停止旧派发器。
仅显式排除无 gateway／agent／patch 的免费准备回执，原始回执 hash 仍绑定；任何付费失败或未知均保留。
递归来源校验绑定原两并发、四并发 adapter，执行／评分／模型／预算不变，延迟与资源按阶段报告。

```sh
node eval/swe-pro/capacity-monitor.mjs --lease eval/results/swe-pro-glm53-flash/capacity-lease.json --trace eval/results/swe-pro-glm53-flash/capacity.jsonl --max 8 --initial 6 -- --tasks-root TASKS_ROOT --runtime RUNTIME --readiness READINESS --continue-from eval/results/swe-pro-glm53-flash/baseline-four-workers --continue-adapter eval/results/swe-pro-glm53-flash/adapter-four-workers --exclude-unproductive --allow-vm-memory-change --out eval/results/swe-pro-glm53-flash/baseline-adaptive --allow-memory-overcommit
```

免费验证覆盖六到八的实际 admission、降到零不取消已有任务、重复 drain 信号、过期／损坏许可、
未知资源、三次安全采样、递归原回执 hash、严格免费准备排除；真实 Docker 探针加 `--dry-run` 烟测
退出 0、仅启动／清理自己的资源容器，不调用模型。149 个 host tests 及全部工程检查通过。
