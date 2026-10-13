# SWE-bench Pro V2 固定子集 v1

已固定30个真实仓库任务的来源和选择清单；尚未接入新的模型评测器。
选择：20个开发回归、10个保留评估；6个开发任务用于快速检查；普通20、HARD-51共10。
原始需求、任务配置、verifier、参考/测试patch均用官方SHA-256锁定，镜像用linux/amd64平台digest锁定。
完整仓库、镜像层、gold patch及verifier没有复制进本项目源代码目录。

**可用性边界：**元数据/镜像descriptor核验通过，不等于容器验收通过。还未拉镜像层，
也没有在本环境运行空patch和参考patch。正式模型运行数为0。当前glm-5.2路由仍需核验。

`subset-v1.json` 的文件级hash在本目录 `SHA256SUMS`。源码在本项目保持原状，现有
`eval/run.mjs --suite assist` 仍是原四任务；这个清单目前不会被旧runner自动加载。

运行前需要真实仓库/容器评测适配：主模型只见原始instruction及干净repo；官方verifier和
参考解答在评价侧。模型patch最终在新环境中重放评分。每条F2P/P2P保留原样；9条P2P为空的
任务不能被声称具有完整回归覆盖。项目子集分数不能作为官方642任务总榜分数。

上游harness为MIT；任务内容继续适用各原始仓库许可。清单保存来源和base commit，
不将上游代码自动归入本项目的MIT授权内容。

详情与30项列表见 `docs/research/2026-10-13-swe-pro-v2-subset-v1.md`。

## 使用官方工具物化任务

本目录提供30项及development/holdout/smoke的独立ID列表，均来自同一JSON清单。
检出上游固定commit后，可用其原有工具创建任务目录（无需改写原题或verifier）：

```sh
python3 v2/tooling/make_subset.py v2/tasks /absolute/path/to/instance-ids.txt /absolute/path/to/materialized-subset
```

该命令在上游SWE-bench_Pro-os checkout中运行。`smoke-ids.txt`可替代全部ID列表。
模型评测仍需容器环境与本项目插件运行适配；此处未执行materialization或容器任务。
