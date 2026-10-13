# 工程能力测试集选型 — 2026-10-13

状态：已选择SWE-bench Pro V2，已冻结30项来源清单；新的评测器和容器验收仍待接入。本轮只查官方资料和任务元数据，没有新增付费模型评测。

目标：固化一批真实仓库任务，长期比较同一主模型在 existing/facts（以后可含 probe/recovery）下的独立修复成功率，同时审计旁路事实、主模型动作、错误介入和额外开销。保留正常需求和工具权限，不通过削弱主模型制造差距。

## 候选基准

| 基准 | 主要内容 | 对本项目的用途 |
|---|---|---|
| SWE-bench Pro V2 | 642个真实仓库任务、11个仓库、Go/Python/JS/TS；含HARD-51、任务镜像和独立verifier | 首选主测试集：可覆盖实际调用、跨模块状态、API契约和回归；环境成本较高 |
| SWE-bench Multilingual | 300个真实GitHub任务、42个仓库、9种语言 | 跨语言优先时的备选，涵盖C/C++/Go/Java/JS/TS/PHP/Ruby/Rust；仍需按任务核验构建和验收 |
| SWE-bench Verified / Lite | Python真实仓库修复；Verified为500个专家筛选任务 | 适合兼容性和入门参照；官方审计指出Verified的测试缺陷与污染风险，不能作为唯一质量依据 |
| SWE-rebench V2 / SWE-bench-Live | 大规模或持续更新的真实repo任务；可执行环境 | 后续补充新任务池；需要固定某次快照并做额外任务质量检查，不能随latest自动变动 |
| Terminal-Bench 2.0 | 终端中的复杂端到端工作，覆盖编码、构建、运行环境等；Harbor运行 | 适合以后扩展工程恢复/运维能力，和目前定位事实辅助的目标有一部分距离 |
| SWE-Lancer | 真实自由职业软件开发与技术方案选择，含端到端验收 | 适合较完整产品开发能力，首轮接入范围和环境较重 |
| HumanEval / LiveCodeBench | 函数级生成、竞赛编程等 | 可保留为底层编码校验；仓库级监督的主指标优先用真实repo修复任务 |

官方来源：

- [Pro代码和发布信息](https://github.com/scaleapi/SWE-bench_Pro-os)，[V2协议](https://github.com/scaleapi/SWE-bench_Pro-os/blob/main/v2/README.md)，[数据卡及许可](https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro)。
- [Multilingual](https://www.swebench.com/multilingual.html)，[SWE-bench数据集说明](https://www.swebench.com/SWE-bench/guides/datasets/)。
- [Verified官方审计](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)。审计针对138个疑难任务，不能把其问题比例解释成整个数据集的错误率。
- [SWE-rebench V2](https://huggingface.co/datasets/nebius/SWE-rebench-V2)，[Nebius介绍](https://nebius.com/blog/posts/meet-swe-rebench-v2)。它的大数据集提供train split；不默认把训练用途大池等同于未被训练污染的独立测试集。
- [SWE-bench-Live](https://github.com/microsoft/SWE-bench-Live)。
- [Terminal-Bench发布说明](https://www.tbench.ai/news/announcement-2-0)，[官方仓库](https://github.com/harbor-framework/terminal-bench)。
- [SWE-Lancer](https://openai.com/index/swe-lancer/)，[HumanEval](https://github.com/openai/human-eval)，[LiveCodeBench](https://livecodebench.github.io/)。

## 推荐：SWE-bench Pro V2 的固定子集

这是基于本项目目标作出的选型判断。V2提供明确需求、真实仓库快照、任务级镜像、参考补丁与verifier，适合检查“有效事实是否改变主模型后续动作并让原始验收通过”。选择V2而非旧731任务v1，避免混用旧镜像和旧评分脚本。公开benchmark仍可能有污染和需求/测试问题，本项目要保留自己的复现与质量核验。

本次读取的官方快照：

- 源：`scaleapi/SWE-bench_Pro-os`
- commit：`66f92766bba642462d4bbe5479e83f91f9211862`
- V2版本：`2.0.0`；发布日：2026-09-22
- 已核对该commit下有642个`instruction.md`。

库中任务分布（只读目录元数据，不代表难度）：NodeBB38、Ansible82、Element Web52、Flipt78、Vuls58、Teleport68、Open Library82、Navidrome52、Proton Webclients55、Qutebrowser73、Tutanota4。

可读的任务示例（只是候选示例，未在本机验证可运行）：

- [NodeBB缓存一致性](https://github.com/scaleapi/SWE-bench_Pro-os/blob/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-00c70ce7b0541cfc94afe567921d7668cdc8f4ac-vnan/instruction.md)：多个模块共享缓存状态与初始化边界。
- [Navidrome专辑图像文件状态](https://github.com/scaleapi/SWE-bench_Pro-os/blob/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_navidrome__navidrome-0130c6dc13438b48cf0fdfab08a89e357b5517c9/instruction.md)：真实音乐服务的专辑模型需求。
- [Tutanota桌面附件打开](https://github.com/scaleapi/SWE-bench_Pro-os/blob/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_tutao__tutanota-51818218c6ae33de00cbea3a4d30daac8c34142e-vc4e41fd0029957297843cb9dec4a25c7c756f029/instruction.md)：桌面应用的附件下载/打开路径。

## 建议的初始范围

先固化30个用例，20个开发回归、10个保留评估；其中6个开发用例构成快速检查集合。JS/TS、Python和Go保留覆盖，至少来自6个仓库。以仓库或相近问题簇隔离开发与保留集合，限制单个仓库占比。

初期以普通V2任务为主体，加入少量HARD-51任务；不直接把51个极难任务全部作为首轮。最终比例要在环境核验和一次单独的难度校准后确定，并在正式对照前冻结。不能按facts当前是否容易触发来挑题，不能只挑旁路获胜的题报告。

筛选关注：

1. 入口/调用链或跨模块状态需要真实定位。
2. API、类型、异步和状态契约需要看实际使用场景。
3. 边界输入、异常路径与回归需要有效实验。
4. 保留一些较容易任务，衡量额外开销和错误介入。

标签可以多选，不把补丁行数直接等同于难度。若按目标模型的失败挑出挑战集，必须明确标成开发/诊断集合；独立保留集不能在看过A/B收益后继续换题。

## 固化内容与验收

固化的单位是完整任务：repo在base_commit的快照、原始需求、依赖环境、原始验收和评分器；不简化为新的几行小demo。

建议清单记录：benchmark名称/版本/上游commit、instance_id、repo、base_commit、需求文本hash、容器镜像digest与架构、verifier及测试patch hash、参考patch hash、F2P/P2P列表、分类标签、split、许可和固定预算。禁止只保存一个会变动的镜像tag或latest数据集名。

每个候选必须在实际评测环境验证：

- 空patch不能通过目标修复验收；原有回归测试的预期状态明确。
- 参考patch能通过修复测试和要求的回归测试。
- 多次复跑无明显flaky；环境/依赖失败单独记录，不能算模型解题失败。
- 测试需求有明确出处，不以某种实现细节拒绝等价正确方案。

沿用原始verifier，最终将模型patch应用到干净环境独立评分。gold patch、隐藏测试、verifier和评分数据只在评价侧，主模型和旁路都不能读取。模型工作阶段限制可见git历史和联网范围，避免取到公开答案；模型端点连接与项目代码联网权限分开处理。

Pro V2官方锁定协议的每任务预算为50分钟。项目可以另设一个较短的内部回归档，但必须标明预算不同；不能继续把目前3分钟小任务配置称为等价官方评测。准备环境的时间与模型活动时间分开记录。

评测适配将需要支持真实仓库和容器/外部worker。CLI仍由Claude Code运行本插件，容器基准不要求把主执行器换成别的agent；运行接口和评分可复用官方Harbor/locked-protocol流程。

## 项目特有指标

功能主指标：F2P和P2P是否满足原始任务验收。另统计约束遵守、报告诚实度、超时/环境失败、完整调用usage、已核对费用与耗时。

旁路审计保留：首次错误或缺失信息、新增事实来源、主模型随后的动作、独立验收；复述已有事实、无介入和错误诱导回归都保留。只把A也失败、B获得有效事实后改变路径并通过验收的案例视为质量增益线索；小子集仍不能证明广泛能力或统计显著性。

维持相同主模型、权限、主预算和旁路预算；原先指定的glm-5.2实际路由问题需要另行解决，不能借benchmark接入静默切换模型。

## 环境与许可

Pro V2预构建镜像为linux/amd64。当前本机是arm64，Docker CLI存在，但只读`docker info`无法连接daemon；目前没有验证本机能直接运行这些镜像。建议独立Linux x86_64容器worker；CentOS7无Docker的部署环境与评测worker可以分开，评测镜像不要求插件增加真实目录独立执行权限。

Pro工具和harness为MIT，任务文本、patch、测试仍受各上游项目许可约束。固化时保留来源和许可记录，优先将任务清单及评分适配放进本项目，仓库快照和大镜像放在独立缓存/镜像仓库中，不把所有任务内容自动当成本项目MIT授权内容。

## 下一步

选定基准和运行环境后，先生成候选清单与可跑性报告，再确认30项正式子集及接口设计，最后接入并冻结。当前没有新数据集的真实运行结果或官方分数。

实施更新：已按上述方向选定30项（20开发/10保留、6快速检查），覆盖11仓库、20普通/10 HARD-51。来源与镜像digest核验通过，详情见[固定子集清单](2026-10-13-swe-pro-v2-subset-v1.md)；容器验收和模型运行未开始。
