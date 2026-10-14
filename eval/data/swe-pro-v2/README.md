# SWE-bench Pro V2 固定子集 v1

已固定30个真实仓库任务的来源和选择清单，并接入本机 Docker 评测适配器。
选择：20个开发回归、10个保留评估；6个开发任务用于快速检查；普通20、HARD-51共10。
原始需求、任务配置、verifier、参考/测试patch均用官方SHA-256锁定，镜像用linux/amd64平台digest锁定。
完整仓库、镜像层、gold patch及verifier没有复制进本项目源代码目录。

**可用性边界：**清单中的 readiness/models 是冻结时的来源记录，不会用后续运行结果改写。
2026-10-13 已开始拉取固定镜像、执行空/参考patch容器验收；GLM-5.3 实际身份及完整
Claude 运行时预检通过。正式轮次及逐任务就绪状态以 `docs/evals/2026-10-13-local-swe-pro-glm53.md`
和对应运行收据为准。元数据核验、免费自测、环境验收均不等于模型工程质量。

`subset-v1.json` 的文件级hash在本目录 `SHA256SUMS`。现有 `eval/run.mjs --suite assist`
仍是原四任务；真实仓库使用独立的 `eval/swe-pro/` 适配器。

运行前需要真实仓库/容器评测适配：主模型只见原始instruction及干净repo；官方verifier和
参考解答在评价侧。模型patch最终在新环境中重放评分。每条F2P/P2P保留原样；9条P2P为空的
任务不能被声称具有完整回归覆盖。项目子集分数不能作为官方642任务总榜分数。

上游harness为MIT；任务内容继续适用各原始仓库许可。清单保存来源和base commit，
不将上游代码自动归入本项目的MIT授权内容。

详情与30项列表见 `docs/research/2026-10-13-swe-pro-v2-subset-v1.md`。

2026-10-14 用户最终选择主／旁路均使用 `zhipu/glm-5.3-flash`，重新测量完整 30 题／60 次建立新基线。
GLM-5.2 旧名称在 Coding Plan 会转为 GLM-5.3，之前尝试已停止且不能作为新基线。
后续开发全量回归使用 Flash 同轮失败／未知并集；快速回归固定一个基线双通过和一个双失败任务／4 次。
历史 `failure-union-v1.json` 不能用于 Flash 首轮选题；完整命令、身份政策与状态见
[Flash 协议](../../../docs/evals/2026-10-14-glm53-flash-baseline.md)。

## 使用官方工具物化任务

本目录提供30项及development/holdout/smoke的独立ID列表，均来自同一JSON清单。
检出上游固定commit后，可用其原有工具创建任务目录（无需改写原题或verifier）：

```sh
python3 v2/tooling/make_subset.py v2/tasks /absolute/path/to/instance-ids.txt /absolute/path/to/materialized-subset
```

该命令在上游SWE-bench_Pro-os checkout中运行。`smoke-ids.txt`可替代全部ID列表。
本机适配器保留官方 verifier 原样，主模型容器只挂载只读的 Linux 运行时和冻结插件；
任务材料（尤其 gold/tests）不挂载进去。模型通过内部 Docker 网络上的受限网关访问
当前 Claude 路由，主/旁路均固定 GLM-5.3-Flash，并核对上游政策和运行收据。凭据只在宿主进程中使用。

已物化任务和运行时后，从本项目 checkout 运行：

```sh
node eval/swe-pro/readiness.mjs --tasks-root /absolute/path/to/materialized-subset --out eval/results/swe-pro-glm53-flash/readiness
node eval/swe-pro/run.mjs --tasks-root /absolute/path/to/materialized-subset --runtime /absolute/path/to/frozen-linux-runtime --readiness eval/results/swe-pro-glm53-flash/readiness --out eval/results/swe-pro-glm53-flash/baseline
```

运行时目录包含经过官方 checksum 核验的 Claude 2.1.295 linux-x64 binary、Linux Node
22.23.3 binary、官方 manifest。`freezeRuntime(root, runtime)`（`eval/swe-pro/agent.mjs`）
复制并锁定两臂插件和网关，生成 `identity.json`；同目录不能重新冻结。任务 artifacts 在
每次验收和模型运行前重新核验。免费机制回归已加入 `node scripts/check.mjs`，不需要启动 Docker。
宿主需要 Node、Python 3、Git、Docker；模型运行还需要当前 Claude settings 的有效路由及 key helper。

对比固定 seed=53，一次 existing/一次 facts，共60项，单任务50分钟。`--jobs 1|2` 默认2，
双槽需要 Docker VM 至少8.5GiB内存；保持每任务4GiB上限，内存不足时显式使用 `--jobs 1`。
断开/取消用量保留 unknown 和已观测下界；本机 CLI 的未知计价口径不作为实际费用。
恢复运行必须保持配置/实现/runtime不变；未完成的付费 attempt 会保留并要求先审阅，避免自动重复收费。
