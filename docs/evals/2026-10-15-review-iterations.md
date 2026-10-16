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


## Round005：异步等待恢复，暴露真实输出预算问题

用户再次要求继续循环后，冻结91c8722，以seed`6f80427e1b2388704876f087c3ab84b3`从最新完整caller-scope双失败集合一次抽中Flipt c172。existing／supervise各一次15分钟并行观察，2026-10-16T13:20:10Z完成2/2并通过基础审计；没有重抽、重跑或full。原生CLI／Node／GNUloader保持原字节；253普通宿主检查和一次6.1sol历史接入审查＋重要修复TDD绑定launchgate。两组均达到外层观察上限，均为空patch；官方命令失败，0项parsed／2项required，不能写成“两项测试明确失败”。该成绩只描述本轮，不作为审查收益目标。

supervise触发一次exploration审查，prepared输入1份、无缺段／格式错误。已恢复Router实际请求并逐字核对去除私有sessionId后的上下文，与prepared记录完全一致。真实调用106555ms后结束、timeout=null，证明不再被原30秒模型等待中止；但返回host empty-reply，无有效JSON、无判断、无反馈。Router原记录200，stop_reason=max_tokens，content只有thinking，无最终公开文本，usage3290input／4048output。只保存规范化输入和bodySHA，未复制thinking。

免费公开API对照先在macOS、再在同一冻结Linux／Node／GNUloader证实：maxTokens2000实际发送max_tokens4048；low／high仅加入output_config.effort，不去掉2048；1952发送4000，1发送2049。两者均网络none／合成loopback／0付费调用。当前budget仅预留requested cap2000，实际wire可用4048，首个真实调用也确实消耗4048，超过声明的4000总上限48；旧预算声明不能作为本轮已严格守住上限的证据。另一个独立问题是usage>=requested cap不能独立证明provider截断；本次只有结合Router stop_reason才确定。

智谱当前[GLM-5.3-Flash官方说明](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)明确不支持关闭thinking，因此不能用“关闭思考”冒充有效方案。公开effort低档在当前Anthropic原生端点的实际效果尚未验证；不得猜测已关闭thinking、改全局Router或扩大预算。下一批只在仓库内修复请求／wire／实际usage的预算预留和诊断，先免费RED→GREEN及全普通检查；之后才允许一个新的受控单题观察问题，不无变化重试本轮。

两组实际请求E49／S35，Flash响应起始E31／S20；本窗口84条Router body均可解析，其中51条完整原需求匹配、均Flash／200，其余不归因。全部本地身份事件均Flash。资源177样本、最低可用10614722560B、swap0／OOM0／无429排空。两组完整usage缺失，观察量E77406input／23115output／962880cache，S285997input／18326output／431680cache仅为下界；费用unknown。七个判断维度仍全部未观察，不能把等待／输入链路正常当审查能力达标。

本轮15项关键hash另存completed-receipts-sha256.json；连同前四轮共75项，旧回执保持。控制器与所有评测容器均退出。预算诊断的6.1sol是只读咨询，不冒充新整组代码审查。具体资料在round005目录及`.superpowers/sdd/2026-10-15-review-iterations/round005-budget-diagnosis/`。


## Round005 后预算与诊断批次（仓库内兼容修复）

已按 systematic-debugging／test-driven-development 流程把两项真实问题集中修复。语义审查通过公开 session.version 识别精确 2.1.295＋显式 Flash 组合，requested1952、宿主allowance2048，预留真实 wire 上限4000；一次调用用完预留，不退还未消费部分、不增加总预算。其他组合记录 unverified-output-cap，不发语义模型调用，继续确定性规则。existing/facts 保留旧请求策略，其 wire cap 不冒充已经验证。该兼容性收缩不是模型强弱判断；未来版本必须补公开 API 证据后再支持。

Coordinator 现在把请求与宿主allowance一起预留，并补扣已观察实际超额、阻止后续派发。超额已经发生时不能回收消费，不将事后拒绝说成事前避免。本批将 usage>=requested 的推断删掉：有效 text 即使高于1952，只要未超预留仍经过原 JSON／来源／Binding／checkpoint gate。记录 requestedOutput、wireOutput（未知为null）、reservedOutput、实际output、宿主typed reason、providerStopReason=null；宿主不提供该stop字段，不凭usage补造。公开effortlow仅是本轮新兼容性条件；下一真实单题需观察其实际结果，不能称关闭thinking、解决质量或保证JSON。

原始新增回归 RED 为9项行为失败；修复后另发现版本查询异步取消可预支新任务额度，增加失败回归并修复。首次生产插件断网fixture在0.25CPU／65秒外层限制下未等到35秒固定回复，保留timeout回执；随后1CPU／120秒fixture取得wire4000、35秒后有效text、下一主请求可见，但原生宿主会把含token的诊断键值遮蔽成裸[REDACTED]，导致诊断JSON不可解析。这是新增留证问题，不是实际请求被改写。

对这个真实问题单独RED（265通过1失败）后，采用与既有input/output一致的公开数值字段名，保留宿主敏感值脱敏，不编码／混淆sessionId或凭据。266宿主测试及全部 node scripts/check.mjs 最终exit0，日志budget-batch-final-checks.log。本批为作者TDD；此前6.1sol历史接入审查不覆盖本次预算代码，不重复派审查。原五轮75项关键hash保持，原audit不重跑。生产断网复验回执补在同一批次记录后，才允许新source/out。

本预算策略的能力限制必须保留：一提示最多一次语义模型调用，后续计划／实现／完成阶段可能没有剩余预算；一次审查应覆盖当时实际出现的多个维度，不能将尚未出现的维度记为正常。普通测试／固定回复只证明机制，不证明真实审查建议质量、供应商effort含义或官方收益。


最终生产复验：budget-batch-native-verified/receipt.json，未修改的同冻结Linux CLI／Node／GNUloader、networknone、0付费。真实插件公开请求1952／effortlow成为wire4000；35035ms后合成最终text，报告output3000高于requested仍正常接收，timeout=null；一条可解析SIDE_CALL保留1952／4000／4000，providerStopReason未知。历史建议恰一次submitted，后续main6请求实际可见，2个result／exit0；这是固定回复机制证据，非真实模型能力。生产源文件SHA与当前仓库逐一一致。没有活动fixture／评测容器，旧75hash再次核对一致。


## Round006：一次真实 wire 预算下的审查观察（已完成）

新冻结源码25e40297dc9f699ab0962b2be045fbd6d05f24e9，seed `c6076a06302fb2070811cf9a2acf29b8` 从最新完整caller-scope full4一次抽中Flipt c172，未重抽。existing／supervise各一次900秒并行，2026-10-16T13:42:28Z两槽实际starting，唯一controller11639／monitor11642；最新PID文件为准。仅新观察，不重跑005回执，不追加full。

免费dryrun验证2个arm；相同native CLI／Node／GNUloader的本地命令preflight2865ms、networknone、0付费。最初包装脚本把runAgent返回的{receipt,patch}误当扁平receipt，断言未通过；原生运行本身completed／exit0，保留envelope后规范化已有回执，没有重跑。launchgate绑定266宿主＋全普通检查、原生预算fixture、runtime/helper/selection/父summary及75旧关键hash。语义请求1952／预留wire4000／公开effortlow／模型等待无插件timeout；该版本每提示最多一次语义调用，后续阶段未获预算不算正常。

本轮明确问题是公开low条件下是否有可解析、来源充分、带历史checkpoint的判断和实际模型可见反馈；low的实际供应商意义仍未知。自然出现的所有维度统一审计，不以官方通过为目标；结论待全部自然结束与行为审计后给出，未声称当前运行成功。


### Round006 完整行为审计与集中修复

2026-10-16T14:04:01Z完成2/2基础审计；原controller／monitor及容器退出。两组主观察各900秒后timeout；existing空patch，supervise保留6631字节部分patch。官方命令均失败，0parsed／2required，不表述成两项明确失败；supervise官方验证另耗385829ms，不计作主模型运行超时扩大。无审查反馈，因此部分patch不能归因监督。

真实侧请求为wire4000、output_config.effortlow，3999ms后host answered，2277input／99output；Router200／end_turn，content含thinking与公开text，只归档公开text／规范化元数据／bodySHA。该次公开回复是Markdown代码围栏内的JSON，reviewed为exploration／verification、judgment=null、action=none，缺少reviewId和checkpointId。原parser正确拒绝，未放宽来源、绑定或格式边界；0有效判断、0投递，七维建议质量均未观察。该次有公开回答不证明low导致改善或关闭thinking，不能与005不同上下文作因果比较。

两份prepared输入均完整；仅第一份与实际Router上下文（省略私有sessionId）逐字匹配并真实派发。第一份没有技术方案／源码内容，只有目录列表、Glob空结果和三条Grep的“No matches found”；这些负面查询仍是实际证据，但旧hasExplorationEvidence把它们当作两条实质源码证据，过早耗尽一次wire预留。后来的implementation prepared含6068字改动与go vet依赖DNS失败，未派发侧调用；“review-unanswered”在这里误示供应商没答，真实原因是预算已预留完。

同一批次处理三个实证问题：负面Grep保留在上下文、但不计入探索首审触发；完整原始JSON响应模板内直接包含两个固定checkpoint标识，并明确不加Markdown，abstain也不得删标识；无调用预算时先记录budget-exhausted，不准备无法派发的输入或伪记未回答。缺ID／旧围栏回复仍拒绝，不自动补来源标识、不强迫模型制造缺陷。先RED266pass／3fail，再集中GREEN269／0；本批为作者TDD，未重复派reviewer，待全部普通检查与免费真实输入回放后冻结新版本。

资源251样本、最低可用10599366656B、swap0／OOM0／无429排空。E37请求22个响应起始，S52请求31个响应起始；本地实际模型身份全部Flash。Router89窗口条目、87body可解析、51完整原需求匹配Flash／200，其余不归因。全部完整usage及费用unknown；已有观察量仅下界。006新增15项关键hash，连同旧批共90，保留原audit与pending控制器快照，另存behavior-status终结状态，不重跑原审计。

后续仍一次单题覆盖所有自然维度。下一轮只有在本批全部检查通过后观察触发是否等到实际源码／技术决定、完整响应格式与历史标识、预算跳过是否准确，以及有足够材料时的审查判断；不以官方通过为目标，不追加full。


本批最终全部 `node scripts/check.mjs` 通过：269宿主0失败和全部普通检查，日志round006-batch-final-checks.log。首次完整检查发现新测试夹具对只读工具数组调用push、lastTool填null的类型错误，修正夹具后完整重跑通过；未改宿主类型。免费同冻结Linux原生本地命令回放actual prepared上下文：旧探索触发true、新false，3条负面查询仍保留；旧实际回复在新旧parser均拒绝；新完整模板含原样review-15／checkpoint-8-review-15，按原校验可接受。networknone、0模型调用，记录round006-real-replay/receipt.json；没有重建旧临时工作区或声称供应商会遵守新提示。原90关键hash再次保持。


## Round007：三项修复后的单题观察（在途）

冻结source66dffe8410b7b8e590ad56e929e3252ff32beb63，固定seed `47262fd5849a608b6986da03ec534969` 从同一最新完整caller-scope full4一次抽中Proton e65，未重抽。existing／supervise各900秒并行，2026-10-16T14:15:53Z两槽starting，唯一controller14248／monitor14251，以最新PID文件为准。免费dryrun2、同native／Node／GNUloader断网preflight8135ms，launchgate绑定269宿主＋全部普通检查、真实输入免费回放和90旧关键hash。预算4000／公开low／无插件模型等待超时及其他安全边界保持。

本轮观察实质材料触发、完整raw JSON与两个原样checkpoint标识、预算跳过准确性，并统一审所有自然出现的能力维度。只做本轮单题两组，不追加full；未宣称真实模型会遵从新模板或技术判断已达标。
