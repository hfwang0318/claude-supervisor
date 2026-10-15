# 审查全维度单题迭代

用户授权每次只随机一个双失败任务，existing／supervise各一次，审计后按真实问题集中优化。目标是全部研究来源的核心审查能力；链路正常只是第一阶段，不以官方通过或有效事实链为本轮门槛，不自动追加full。未获观察机会、输入不足和观察正常分别记录。

## Round 001：触发已发生，未获得审查回复

- 冻结源码`48bcd8b8c41cffb6dd925d88ca36837338120be3`；同native CLI／Node／GNU loader，主旁路均Flash；223宿主及全普通检查绑定launch gate。后续诊断修复不在这一冻结版本中。
- 固定seed`064fb8ad586971af168e8fd181e6965c`从最新完整caller-scope4的双失败候选抽中Proton e65；两个模式各一次900000ms主模型观察，逻辑facts槽实际supervise，不重抽。
- 2026-10-15 12:04:42Z启动，12:22:09Z完成2/2和基础审计；唯一控制器／monitor和容器均已退出。
- 结果根`eval/results/review-iterations-flash/round-001`，原pending控制器快照保留，另存`behavior-status.json`完成行为审计；15份关键原文件hash单列。

| 观察 | existing | supervise |
| --- | ---: | ---: |
| 本地模型请求 | 36 | 32 |
| 实际Flash返回起始 | 36 | 31 |
| 旁路调用 | 0 | 1 |
| 审查判断／反馈 | 0／0 | 0／0 |
| 主模型状态 | 达到观察时限 | 达到观察时限 |
| patch字节 | 0 | 0 |
| 官方必需项 | 3项均失败 | 3项均失败 |

综合组探索阶段实际发出一次非流式max4048请求；侧调用在30011ms后为`unknown/provider-unanswered`，没有可用审查内容。之后共享活动预算耗尽，没有无限调用。旧版本日志将结束后`current()`为false一律写为`stale-binding`；代码与有控制时钟的宿主测试证实，即使来源没有变化，单纯deadline耗尽也会被误标。该本地分类错误不能解释供应商为何未回答。

实际网关请求68条、返回起始67条均Flash；综合组一条`upstream-error`与侧调用超时相邻。Router窗口67行中46行具有可解析原请求并按完整原需求文本匹配，均Flash/200；其余21行没有可解析原body，不能逐条归因。没有恢复到匹配的非流式max4048原请求body／provider完整回复，所以实际侧输入全文、具体provider耗时和完整侧usage仍unknown，不能虚构原因。SDK侧未回答时给出的0usage不当作真实零消费。

两组完整用量均缺失，以下只为观察下限，费用unknown：existing input51022/output18655/cache849152；supervise input57004/output30639/cache748608。203个资源样本最低可用8926027776B、最大swap10055680B、观察OOM0，无429排空；VM12GiB/10CPU/1GiBswap，每题1CPU/4GiB、两槽。官方结果仅描述，不据此优化为求解通过。

## 全维度状态

| 能力 | 当前实测状态 | 仍缺的证据 |
| --- | --- | --- |
| 触发／协议／投递／预算 | 已触发；一次未回答且预算停止；原因分类发现问题 | 实际审查输入和有效输出／投递 |
| 需求—方案一致性 | 未观察 | 真实显式方案与需求的有效审查 |
| 方案—实现一致性 | 未观察 | 方案和实际改动的有效审查 |
| 架构合理性 | 未观察 | 引用成立、符合项目约束且非风格偏好的判断 |
| 决策方向与探索 | 有探索审查机会，无有效判断 | 可用建议、反证与实际主模型后续动作 |
| 需求来源反例 | 未观察 | 来源和oracle正确、执行或未执行状态明确 |
| 失败恢复 | 未观察 | 真实重复失败与后续结果支持的恢复建议 |
| 验证与完成度 | 未观察 | 需求覆盖、实际检查和完成声明的有效判断 |

## 根据本轮证据的最小修复

修正deadline、取消、关闭与实际来源变化的原因分类，仍拒绝迟到／过期反馈。新增`REVIEW_INPUT`：记录有限、脱敏、已准备的审查上下文及提示签名；不存thinking或原始未解析回复，不把准备等同于网络接受。它解决本轮原请求未保留导致输入不可核对的观测缺口，不能声称解决了provider超时。

回归测试先出现2项行为失败（期限误分类／输入不可审计），真实来源变化的负对照保持通过；修复后执行全部`node scripts/check.mjs`。下一轮只验证已准备实际材料是否合理，以及是否获得可解析判断／投递；如果仍只有供应商无回执且无新的可复现本地问题，不靠同样配置反复付费。各能力继续保留未验证，不能把阶段1或本单题当作全维度完成。

## Round 002：输入可核对，发现泛泛探索意向误当方案

冻结`7202acdf75944db6962fd3aaa5077860c73ec86e`，固定seed`a8ce67d53c22307db970d0f6caa6f8a7`又抽中Proton e65，未重抽。12:33:05Z两组并行启动，12:50:32Z完成2/2及基础审计，旧控制器／容器均退出，15份关键原文件hash另存。

综合组保留到一个真实`REVIEW_INPUT`：需求原文5579字符，SHA与原instruction完整一致；方案来源76字符，仅为“I'll start by exploring the repository structure to understand the codebase.”；另一个来源是`ls /app && ls /app/applications/mail/src/app/logic/elements/`的Bash目录列表，没有源码、实现改动或具体设计决策。来源是实际公开文字，问题在于把泛泛探索意向标作技术方案，过早消耗了有限审查机会。prepared留证不代表provider已接受，也不能据此说模型输出正常。

侧调用30003ms后仍`provider-unanswered`，现在正确分类为`deadline`，随后预算耗尽；0判断／0反馈。E30请求30Flash返回起始，S32请求31Flash返回起始；Router窗口61行中38个可解析body按完整需求匹配且Flash/200，其余23行不逐条归因。没有匹配的侧原body/provider回复，原因及完整usage／费用unknown。两组900s到时均无patch，官方3/3失败仅描述。

观察用量（不完整）E input42207/output9702/cache629568，S input59351/output22133/cache815040；203资源样本最低可用8890863616B、最大swap1880064B、OOM0、无429。七个核心判断维度仍没有有效输出，均保持未观察；需求来源真实性本轮有实证，方案材料质量发现具体问题，不能当全部能力已验证。

随后修复仅针对这种单句、泛泛仓库浏览意向：不把它当技术方案；具体机制、多步方案仍保留，泛泛意向只有目录列表时不调用模型，之后满足两个不同有效Read/Grep仍可进入exploration。宿主与纯协议回归RED226pass/2fail→GREEN228及全部普通检查。实际已准备输入的免费规范化重放从旧1个plan／立即可审查变为0plan／等待源码证据；不重建原Host／临时目录、不调用模型，不声称已解决provider未回答。

第三轮若开展，只验证修复后是否能等待实质材料并产生有依据的审查；若仍是供应商无回执且没有新可复现本地原因，停止无变化付费，报告各维度未验证的具体阻碍。

## Round 003：等待源码后触发，真实回复仍缺失

冻结`c786977b3ae26bfc92a2662b155dece40beb75aa`，固定seed`af9df142f7d36ce65324268eefbb1d75`又抽中Proton e65，未重抽。13:01:06Z两组并行启动，13:18:36Z完成2/2及基础审计，控制器和全部评测容器已退出。

日志先为`insufficient-exploration-evidence`，之后进入exploration，说明泛泛意向没有立即启动方案审查；侧调用29995ms后无可用回答，正确标为deadline，随后预算停止。0有效判断／0反馈，七个核心判断维度仍为未观察。

E34请求／34流式返回起始；S29请求，其中27个流式返回起始、1个额外非流式native辅助请求返回（max2112，观察usage input32429/output8），另1个max4048审查请求在30秒内无回执。不要把native辅助回复当成审查模型回答。全部实际带身份请求／返回均Flash；两组900s到时无patch，官方3/3失败仍仅描述。观察用量不完整：E input58308/output30156/cache749632，S input90144/output25602/cache559232，完整usage／费用unknown。204资源样本最低可用8998686720B、swap0、OOM0，无429。

### 同一轮集中发现并修复的独立问题

1. **宿主日志截断**：实际`REVIEW_INPUT`只有9941字符并以省略号结束，JSON不完整。宿主类型文档明确debug日志最多10000字符；原输入上下文允许更大，单行留证因此失效。大记录现分成相关联的小段，评测只有在段数、顺序、关联标识和总长度均完整时重组；缺段、重复、混入其他输入或原日志截断都保留不可用，不虚构完整来源。
2. **宿主失败原因丢失**：原代码把宿主`aborted`／`api-error`／`empty-reply`合并成`provider-unanswered`，无法知道是中止、错误还是空文本。新增有限类型、状态码和错误枚举，不保存原始错误body；历史三次的具体宿主原因仍未留存，不能反推。

回归先RED228pass/4fail（大输入无法重组、三类宿主原因缺失）；集中修复后232宿主通过。评测重组测试也先因缺失输入审计行为失败，之后覆盖乱序可恢复、缺段／重复／错误关联拒绝及旧短记录兼容。批次最终运行全部`node scripts/check.mjs`，不为每个小改动追加模型观察。后续修复采用作者审查＋TDD，早先一次独立审查不覆盖这些新改动。

### 免费排查与真实阻碍

在断网Linux容器，使用同字节native CLI／Node／loader，以单独标记的固定本地回复fixture检查native `model.complete`。默认和显式low effort都能得到固定文本，native请求为非流式max4048；low会添加`output_config.effort=low`。又验证native CLI→relay gateway→带relay验证的host gateway→固定本地回复，均成功。所有fixture都在`.superpowers`，0付费、无真实provider访问；这些是假回复机制检查，不能写成GLM质量或服务恢复证据。生产effort和预算均未改变，没有据此猜测降低effort能解决问题。

三次真实审查均在30秒活动窗口内未取得可用回复。Router未保留匹配的max4048审查原body／完整provider回复，窗口内pending updates也为空；因此当前无法分辨真实上游处理慢、连接路径中止或其他原因。本地两层转发对固定回复工作正常，也不能排除真实路由／供应商路径问题。没有证据支持调整预算、换题或同配置继续付费会解决它，暂不追加第四轮。全维度优化尚未达成，明确停在真实审查回复这一阻碍，不能把本地检查通过当作能力验收。

### Router引用body补充恢复（不改原回执）

此前只解析SQLite内联body时，Round001/002分别有21／23行未解析。现从`request-log-bodies`的本地引用文件只读恢复，并另存规范化元数据／bodySHA；001共67行、002共61行全部原需求匹配且Flash/200。003共62行body可解析，其中61行匹配完整原需求且Flash/200，另1行是未按完整需求绑定的辅助请求，不擅自扩推。三轮仍均无匹配的max4048审查body。旧`router-behavior-audit.json`保存当时快照，补充在各轮`router-body-recovery.json`；未复制raw thinking、源码输出或凭据，也未改原运行结果。

## 2026-10-16：继续诊断，区分取消与真实上游故障

用户明确授权继续按集中审计／批次修复节奏优化，并在瓶颈时使用GPT-6-Astra；其诊断因额度中断后已按用户要求续做。这次为只读调用链诊断，不是新一轮全分支fresh review。

Astra核实当前公开3456入口由`gateway-bootstrap.js`直接运行core，管理端`cli.js`的兼容代理499记录不在该入口路径。安装包`next-ai-gateway.js`的非流式`Jl`在等待上游响应和读取body后检查取消，并可能提前返回；成功路径之后才生成`vf → sa` trace。直接公开模式的同步器依靠trace bundle以`allowStandaloneRecord`创建request_logs。因此客户端取消可以同时没有原body、完成日志和pending update，缺行不证明请求未抵达CCR。Astra用实际函数与受控依赖报告了成功1条trace、响应头前取消0条、body读取中取消0条的免费对照；父端另行核对安装字节SHA和对应提前返回源码。它不复现真实provider，也不解释30秒为什么没有内容。core SHA为`14e5fad973d13fec170f38d0dee0f9a131aaa002f1a8ab08fccf755465199e3a`，CLI SHA为`43fe94a6bb33c4b1b49fd47f5f3eda2ae8064a740d6e5def3ba50f95ff0fa6d3`；未改全局Router或重启服务。

父端真实loopback复现另一项独立问题：仅客户端主动关闭就会产生旧`upstream-error`。TDD先确认失败，再将下游取消标成`client-disconnected`；上游连接reset、上游body中断、正常完成和网关身份拒绝均有对照，避免反向误归因。历史记录不重写，旧标签仍不足以判定供应商根因。

同批新增有限边界元数据：实际转发body的SHA／字节长度、request-forwarded、上游headers时间／状态、首字节时间、累计收到字节、唯一transport-end及结果。这里的上游是该层连接的端点（host层为CCR），不是已经穿透CCR得到的provider时序；forwarded只表示本层HTTP发送完成，不证明接收方处理；completed只表示传输完成，不证明有效判断或主模型消费。没有保存提示正文、回复正文、thinking或凭据。免费真实socket测试覆盖无headers取消、有headers无body取消、部分body后取消及成功／错误／身份拒绝，每个请求恰有一个终态。测试先因缺失终态失败，再修复；232宿主和全部`node scripts/check.mjs`通过（transport-boundary-final-checks.log）。三轮45个关键原文件hash一致。

仍不能判断实际provider排队、生成或网络原因，不凭low effort猜测关闭思考，不扩大30秒／2call／4000token预算。新的单题观察若启动，只回答此前无法核对的实际完整输入、宿主typed reason及边界时序，并统一审计所有自然出现维度；不以官方通过为目标。新冻结版本／新out，旧批次不重跑，无有效判断的能力继续标未观察；本地检查通过不代表服务恢复。

## Round 004：取消边界已核实，仍未取得判断

冻结源码`53f354a99dbd834f2f860d6c8a14760584741501`，固定seed`b40558561cc15fd34995e5b8609ac07f`再次抽中Proton e65，未重抽。2026-10-15 16:51:26Z两组并行启动，17:08:53Z完成2/2及基础审计。两组均到900秒观察上限；existing留下10944字节部分patch，官方仅解析到1项通过、必需3项未齐，整体失败；supervise无patch，官方3项均失败。这些是限制下的任务结果，不将组间差异归因为监督。

E38条请求／38个实际Flash返回起始，S43条请求／42个实际Flash返回起始。唯一审查请求为非流式max4048、实际转发body21652字节：16:51:49.468Z发送，16:52:19.465Z以`client-disconnected`终结，elapsed29997ms、headersMs／firstByteMs／status均null、接收0字节。宿主`SIDE_CALL`保留到`hostReason=aborted`，elapsed29995ms、timeout29988ms，之后deadline／预算停止。没有可解析审查回复、判断或投递，七个判断维度仍未观察。它只说明本层在原时限内未收到CCR回复，不说明provider内部发生了什么。

Router实际窗口80条完成记录，31条引用body只读恢复后80条均可解析、匹配完整原需求且Flash／200；仍无审查max4048原body。203资源样本最低可用9001095168B、最大swap10063872B、OOM0、无429排空。E观察用量input74234/output37512/cache1256704，S51397/26936/1005056，完整用量及费用unknown；宿主取消时的0不当作零消费。四轮共60份关键原文件hash保持一致，原控制器pending快照不改，另存行为审计终态。

### 本轮实际问题及免费修复

18个`REVIEW_INPUT_PART`全部到齐，但总长度17259小于声明17286，第0段由1000变为973字符。实际宿主把内层JSON中的`binding.sessionId`遮蔽为`[REDACTED]`并破坏引号，因此现有reader正确拒绝。这里受损的是诊断表示，不能宣称模型实际输入受损，也不能放松校验或以编码绕过遮蔽。

用同字节native CLI／Node／GNU loader、断网、本地命令和公开合成材料复现：旧格式14段均到齐，13153→13126字符、0可重组输入。修复只在生成debug表示前省略私有sessionId，明确`representation=session-id-omitted`及省略字段；模型输入、内部证据和运行时Binding不变。其余来源逐字保留。新reader明确计数该表示，拒绝虚假省略标记及头／分段表示不一致；旧格式继续按原严格规则读取，历史损坏记录仍不可用。

宿主回归先RED232通过／2失败，再GREEN234；协议指标先因缺少省略状态失败后通过。原生免费复测调用实际生产`reviewInputLogs`：1份完整隐私归一化输入、0缺段／格式错误，29字符需求和12600字符公开来源逐字一致；无模型调用。证据在`.superpowers/sdd/2026-10-15-review-iterations/native-redaction-contract/comparison-receipt.json`。初次合成fixture的hook配置键错误已隔离留存，只重做免费fixture，不影响任何真实评测。最后全部`node scripts/check.mjs`通过，日志`privacy-final-checks.log`；本批为作者TDD，Astra的只读路由诊断不冒充新全分支审查。

本轮对触发、有限预算停止、typed宿主失败、取消边界有明确证据；完整真实来源输入仍因旧日志损坏无法核对，全部判断质量与反馈行为仍未验证。新代码修复观测性，未证明解决无回复。当前无活动评测任务；不自动第五轮、不改预算／effort，不用重复付费替代尚缺的CCR/provider内部时序证据。全维度优化未达成，剩余真实阻碍如实保留。
