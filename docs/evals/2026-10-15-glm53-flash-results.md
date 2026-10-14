# GLM-5.3-Flash 60 次基线交付

完成时间：2026-10-15 02:01 CST。冻结 30 题（20 development／10 holdout，含 6 smoke），每题 existing／facts 各一次。主模型与旁路均为 `zhipu/glm-5.3-flash`；60 次实际请求与返回身份通过审计，无更强 fallback。范围与协议见[Flash 基线](2026-10-14-glm53-flash-baseline.md)。

## 独立验收结果

| 组 | 通过 | 失败 | 未知 | 通过／全部 30 题 |
| --- | ---: | ---: | ---: | ---: |
| existing | 22 | 8 | 0 | 73.3% |
| facts | 21 | 7 | 2 | 70.0% |

配对：18 题双通过、5 题双失败、3 题仅 facts 通过、2 题仅 existing 通过、2 题含未知。审计核对全部 60 个原始回执、原始 patch hash、模型身份、冻结 runtime／adapter、镜像、base 与测试材料；43 个正结果均核对所有官方必需测试。agent 状态与独立测试验收分开：existing 有 2 次超时，facts 有 3 次超时；超时的已捕获 patch 仍能接受独立评分，不能把 timeout 自动视作功能失败。

facts 组 20 次定位任务：15 次 `selection/unknown`、5 次 `inspection/unknown`，0 次组包／投递。另 10 题未触发定位。五次检索中止的任务均双通过（NodeBB 7b8bffd、Ansible 5260527、Navidrome 874b17b、OpenLibrary fdbc0d8、Qutebrowser a84ecfb）。从 SIDE_CALL 到检索结束为 0.52–1.56 秒，旧记录没有选择耗时、剩余预算、请求或检索原因；因此尚不能判断具体检索拒绝条件，也不能断定全部选择 unknown 都是超时。

没有新增事实→主模型改变动作→独立验收的完整证据链，本轮不能证明监督收益。单题仅一次且任务是固定子集，也不能推断统计显著优势或官方全榜分数。Task 2 probe／Task 3 recovery 的两条有效实例门槛保持关闭，后续先修正定位能力。

## 资源与阶段

CPU 10、Docker 29.7.2／aarch64、固定 linux/amd64 任务镜像；单题 1 CPU／4 GiB、VM swap 1 GiB。调度及资源变化显式保留各阶段原始身份。

| 阶段 | 有效尝试 | 并发 | VM 实际 MemTotal | existing 通过／失败／未知 | facts 通过／失败／未知 |
| --- | ---: | --- | ---: | --- | --- |
| baseline-resumed | 22 | 2 | 9,361,784,832 bytes | 8／3／0 | 7／2／2 |
| baseline-four-workers | 11 | 4 | 9,361,784,832 bytes | 1／1／0 | 8／1／0 |
| baseline-adaptive | 27 | 自适应 6→8 | 12,526,370,816 bytes | 13／4／0 | 6／4／0 |

配置内存从 9 GiB 增至 12 GiB，等待全部活动模型与评分自然结束后才重启，没有在这次内存切换中取消付费任务。资源压力只暂停新派发。监测期间没有观测到本轮 OOM；结束后 runner／监测器退出 0，清理自己的探针，活动评测容器为 0。此观察不证明所有未来峰值都有保证。

混合阶段 agent 中位耗时 existing 21.40 分钟、facts 18.53 分钟。各阶段并发与任务分布不同，不能据此归因效率收益；原结果保存分阶段统计。

## 用量与历史限制

完整 usage 仅 existing 1／30、facts 12／30；费用、每成功任务成本均 `unknown`。以下是已观测下界，不能外推为完整消耗。

| 组 | 输入 | 输出 | 缓存输入 | 请求 | 旁路 answered／unknown |
| --- | ---: | ---: | ---: | ---: | --- |
| existing | 10,225,288 | 1,003,718 | 108,622,400 | 2,641 | 6／41 |
| facts | 9,343,583 | 991,232 | 110,878,656 | 2,556 | 5／15 |

- 首轮供应商额度拒绝（429／1308）完整保留。OpenLibrary b67138b existing 曾在 74 次成功响应后收到 5 次额度拒绝，其已评分的失败不能只归因于模型；拒绝调用费用未知。
- 更早两并发→四并发切换取消了 ElementWeb 404c412／ProtonMail cba6ebb facts：已有模型响应但空 patch，保留为 unknown，未自动重跑。后续 VM 内存切换没有新的此类取消。
- 只排除了明确无成功模型响应、无 patch 的免费准备／额度拒绝尝试，保留原始目录与排除 hash；质量失败与已接受模型未知结果均纳入。
- 先前 GLM-5.2 标签实际升级至 GLM-5.3 的无效实验不进入本基线。Flash 外部总输出 token 硬上限仍未证明（SDK 的额外 thinking 额度）；没有声称缺失计费为零。

## 固定后续集合

`failure-selection.json` 为同轮任一组失败或未知的并集：Ansible 42355d1／d62496f、ElementWeb 4fec436／404c412、Flipt c172805、Teleport 2b15263、OpenLibrary f3b26c2／b67138b、ProtonMail cba6ebb／e65cc5f、Qutebrowser c09e143、Tutanota f3ffe17，共 12 题×2 组＝24 次。

`quick-selection.json` 按清单顺序固定 NodeBB 8ca65b0（双通过）与 Ansible 42355d1（双失败），两组各一次，共 4 次。两份选择均通过免费预览与父汇总 hash 校验。快速回归不能更新／缩减失败并集；18 个历史双通过项不算作新版验收。新能力使用独立冻结 runtime 与新输出目录，无自动质量重试。

## 原始交付绑定

原始文件位于隔离工作树的 `eval/results/swe-pro-glm53-flash/`，不提交日志／回执。各阶段 fingerprint：

- resumed：`19420bcf3cc77abf03093c7d4de48cb884a2f8c5e052f6ca46ee5446af09de9d`
- four-workers：`64b65d55b6831f669fa48c309aa1399de137643d26481474732cb2fc1d07361e`
- adaptive：`ec95df838fa77d3d5d7fd63458d987082478c0846d29f61a391328ca848e1c4f`

以下是文件字节 SHA256，与上述 canonical experiment fingerprint 不同：

| 文件 | SHA256 |
| --- | --- |
| baseline-adaptive/experiment.json | f4db98d3b9c72f039a977dd42fddb7e36cbbe4ebac452c2dcf842623cedbd25c |
| baseline-adaptive/summary-baseline.json | 6c5bb04cfcbe22eaef00b819a4b6ab87a0d882444bb944e8b79182f0576ba063 |
| baseline-adaptive/failure-selection.json | 67cdc9d5220f21aaf49d55ced65dc8d8a8552fd56eed2c2e96384dc2b178d126 |
| baseline-adaptive/quick-selection.json | 5f0ad460939bb6d3a114ec1816a3544a11d05e9b3425c4f09825ddd9477a03f0 |

基线已完整审计；核心定位问题及新能力回归尚在继续，不能以免费机制测试代替真实模型结果。
