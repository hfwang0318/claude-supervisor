# 完整核心监督能力 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 在当前隔离分支逐任务实现，用户已明确要求按修订设计开发、先补齐全部维度再做模型回归。采用原会话内联执行，不为每项任务派新 agent。每项按失败测试→实现→免费完整检查→提交推进。

**Goal:** 实现围绕研究过程差异的需求—方案、方案—实现、架构、方向、探索／恢复、验证评审，统一接入有来源的事实与实验工具，完成后才进行付费回归。

**Architecture:** 纯协议／上下文／判断逻辑、受限行动和宿主调度分开。新增 `supervise` 综合模式，保留默认 existing 和原 facts；probe/recovery 复用统一工具实现。所有路径共用 coordinator 的每提示预算、来源重验和失效门槛，模型意见不升级为已证明缺陷。

**Tech Stack:** TypeScript、Claude Code hooks/testing、既有 Host／Coordinator／runner、Node模型无关检查、Linux模型评测adapter。

**Spec:** [已确认修订设计](../specs/2026-10-15-complete-supervision-design.md)，研究依据见该设计的六过程能力矩阵。

用户最新验收口径（2026-10-15）：本次真实模型只随机一个最新双失败任务，观察审查触发、输入／输出、投递与预算是否正常；不把帮助主模型通过官方测试或取得有效事实链作为本轮目标，不再叠加完整增量。官方结果仅作描述。

## Global Constraints

- 主／旁路实际付费请求均 `zhipu/glm-5.3-flash`，无更强fallback；默认模式existing不变。
- 每用户提示共用2次旁路调用、4000输出token、30秒活动预算；一次在途行动，不通过切模式、取消或反馈重置预算。
- 事实来源保留6文件、2词、200访问项、2MiB读取、256KiB单文件和32KiB返回边界。协议输入／输出64KiB，拒绝未知字段／秘密／不完整绑定，不裁剪后宣称完整。
- 判断可以直接建议继续／调整／重规划／补证据，不必每项先执行；已证实缺陷和修复验收仍须独立证据，不以建议代替。
- 生成命令／文件只在已验证隔离副本中执行，无隔离明确“未执行”交回主模型。off不执行，shadow无模型反馈；新提示/off/取消/模型/工作区变化丢弃旧结果。
- 所有普通检查运行`node scripts/check.mjs`，不调用真实模型。全部维度齐备前不跑付费quick或full；旧原始结果不改、不重跑，不合并推送。

## Review Focus

1. 没有显式方案的上下文不能伪造方案或声称方案一致性已审。
2. 有依据的架构／方向意见不能因没有可执行命令被丢弃，也不能认证为demonstrated。
3. 存在秘密、截断或超大材料时记录未审范围；不声称全项目无问题。
4. 环境失败／导入失败／不同版本／错误expected不能成为已证实反例；恢复不能虚构已排除假设。
5. 多hook竞态、迟到反馈、shadow、预算耗尽与实验组映射不能重复调用、越权或污染旧回执。

### Task 1: 来源化评审上下文与判断协议

**Files:** 新建`supervisor/review.ts`、`tests/review.test.ts`；修改`types/index.d.ts`、`supervisor/contracts.ts`。

**Interfaces:** 导出`ReviewContext`、`ReviewSource`、`ReviewJudgment`、`ReviewReply`、`ReviewAction`；`buildReviewContext(binding, asked, rows, changes, phase): ReviewContext | null`，`parseReview(context,text): ReviewReply | null`，`reviewPrompt(context,mode): string`，`reviewNote(context,reply): string`。每条来源为稳定ID、kind与原文；`reviewed`仅可包含上下文实际支持的维度，未审维度显式标记。

- [x] 测试先失败：需求—方案矛盾可给replan；正确方案与偏离改动可给adjust；架构意见无命令仍可交付；错误／缺失来源、没有方案却声称方案审查、秘密、超大材料拒绝或记未审；合理反证与不确定性保留。
- [x] 运行普通检查确认RED，区分类型缺失与行为失败；实现严格协议、上下文来源与六过程提示词。
- [x] 完整普通检查GREEN后提交此独立协议模块；不调用真实模型。

### Task 2: 复现／反例与失败恢复行动

**Files:** 新建`supervisor/probes.ts`、`supervisor/recovery.ts`、`tests/probes.test.ts`、`tests/recovery.test.ts`；复用`runner.ts`、`ledger.ts`。

**Interfaces:** `parseProbeCandidate(context,value): ProbeCandidate | null`；`probeNote(candidate,evidence): string`；`buildRecoveryPacket(context,observationIds,question): string | null`。Probe引用实际需求ID，command和至多3个相对候选文件受既有`probeRefusal`／runner边界；Recovery仅引用实际失败输出，新增输出使重复失败判断重新核对。

- [x] 测试先失败：正确需求引用与可运行候选；伪造oracle、越界／秘密／危险命令拒绝；未执行、环境失败、截断和主模型观察不冒充独立验证。
- [x] 测试先失败：同错误重复可恢复，不同错误／成功后合理重跑不强行恢复；不存在／非失败观察不能写为已排除；缺来源保持unknown。
- [x] 实现引用解析与中立反馈，沿用`executeProbe`；生成测试永远是hypothesis，除非既有可信oracle验证另行成立。
- [x] 全部普通检查GREEN后提交，不启动付费模型。

### Task 3: 综合与单能力模式的宿主接入

**Files:** 新建`supervisor/review-flow.ts`、`tests/review-host.test.ts`；修改`hooks/register.ts`、`.claude-plugin/plugin.json`。

**Interfaces:** `runReviewFlow(context,reply,ports): Promise<ReviewOutcome>`，ports使用既有Host并接入一次可选第二模型调用、current检查和deadline；Outcome为note／来源／观察／固定原因码，不能伪造投递确认。supervise/probe/recovery只使用该流程，existing/facts原行为保留。

- [x] 宿主测试先失败：方案阶段、实现变更、检查失败和结束触发；架构判断无命令可反馈；location/probe/recovery可分别交付；不运行原existing模型循环。
- [x] 覆盖off不执行但保留未执行建议；shadow只诊断；enabled执行已验证副本并清理；副本失效／超时／取消／off／新提示／模型切换／并发批次不投递旧反馈。
- [x] 按真实来源构建上下文，在合适事件触发；同一版本去重、共享2call预算，不每个工具批次都启动模型。方案审查与之后实现审查共用额度，实际覆盖显式记录。
- [x] 原事实范围沿用安全inspector，投递前事实／执行版本重验；新语义建议只有限返回，不形成无界Stop阻塞。
- [x] 完整普通检查GREEN后提交。

### Task 4: 可验证能力覆盖与实验模式身份

**Files:** 新建`eval/selftest-review.mjs`；修改`eval/swe-pro/agent.mjs`、`regression.mjs`、`run.mjs`及对应自检、`scripts/check.mjs`。

**Interfaces:** 显式`--experimental-mode supervise`，控制组仍existing，实验槽位兼容旧facts选择标签但回执必须另带实际`assistanceMode`并纳入experiment/runtime identity；不能把综合模式当成旧facts结果。旧默认实验与旧读取不受影响。新父轮比较保留明确跨模式说明。

- [x] 免费测试先失败：六过程输入／反馈覆盖、错误架构建议不当作成功；supervise冻结身份与旧facts区别；错误mode／父summary／runtime拒绝；quick随机单双失败与完整并集均保留。
- [x] 实现模式参数与回执／模型行为指标（判断维度、行动、有效/重复/unknown、实际来源、未审范围），不修改旧冻结artifact。
- [x] 全普通检查GREEN，证明没有调用付费模型后提交。

### Task 5: 文档、整体验证与一次行为观察

**Files:** README中英、该计划、研究到能力覆盖记录；当前计划ledger记录各阶段与决定。

- [x] 同步已实现能力／环境与未实现限制；跑完整普通检查，核对六过程矩阵每项有真实调用路径和行为测试，不以提示词文字代替实现。
- [x] 按executing-plans对本次整体diff做一次fresh review；只有Critical/Important进入一次RED→GREEN修复，不反复派reviewer。
- [x] 所有能力和普通检查齐备后，从最新完整caller-scope轮次固定seed抽一双失败任务，existing／supervise各一次、新runtime与out；不叠加full。本次按用户最新要求不跑完整并集，官方通过不是验收目标。
- [x] 重点审计实际模型、模式／来源／Binding、输入上下文、输出协议、投递与预算是否正常；官方验收及主模型后续动作仅描述，不要求帮助其通过；不以投递次数或意见数量宣称收益，不自动无限追加实验。

本轮结果：单题两组已完成并审计，但旁路0调用、0反馈，只有no-explicit-plan跳过，故输入输出正常性未覆盖；详见docs/evals/2026-10-15-supervision-behavior-observation.md。任务勾选表示实现／观察／报告已执行，不表示真实模型行为或收益已验证通过。停止本轮跟进，不自动追加模型试验。

### 后续：探索阶段触发覆盖修复

- [x] 从真实单题0调用记录复现无显式方案阻止架构／方向／探索审查的门槛问题。
- [x] 至少两个不同有效Read／Grep后允许每提示一次exploration审查，不合成方案，不把两个方案一致性维度判为已审；失败／pending／running／截断／重复输入不触发。
- [x] 共享原预算与失效保护，后续工具读取不重复启动；223宿主＋全部普通检查通过。
- [x] 实际Proton公开工具轨迹免费规范化回放第3个结果可获审查机会，保留输入hash与回放限制；原15份冻结关键文件hash保持，没有新增模型调用。

真实新审查输入输出仍未验证。本次只修该已复现覆盖缺口，不自动追加付费试验或重启自动跟进。

### 用户授权的后续迭代（2026-10-15，优先于上述停止指令）

用户明确要求开始单题循环：每轮从最新完整轮次的双失败候选中固定seed抽一个，existing／supervise各一次；先审计实际触发、输入输出、投递和预算，再根据真实可复现问题集中优化，全部`node scripts/check.mjs`通过后才开始下一轮。quick不取代完整父轮，不自动叠加full，不以官方通过或两条事实链为目标。每轮新冻结版本／结果目录；同版本已接受回执不重试。无可复现问题、行为正常或只剩供应商／猜测阻碍时报告，不无限付费。

第一轮冻结`48bcd8b`，目录`eval/results/review-iterations-flash/round-001`，固定seed`064fb8ad586971af168e8fd181e6965c`抽中Proton e65；两组各15分钟主模型观察窗口。后续详见`.superpowers/sdd/2026-10-15-review-iterations/progress.md`。

### 全维度迭代目标澄清（用户最新指令，优先于上文窄口径）

优化目标是审查模型所有核心能力，触发／输入输出／投递／预算只是基础阶段，不代表整体优化完成。各维度围绕已有研究揭示的强弱模型工程过程行为差异增强；允许分阶段，但不能因链路正常或单题没有触发某维度就结束全部优化。仍每轮只随机一个双失败任务、existing／supervise各一次，不以官方通过为目标，不自动full。

| 阶段 | 核心能力与观察问题 |
| --- | --- |
| 1 基础链路 | 合适时机触发、需求与工具材料完整准确、协议与来源绑定、反馈进入主模型、共享预算和过期取消；为后续判断提供真实材料。 |
| 2 需求／方案／实现与探索 | 是否识别遗漏需求和约束、方案偏离目标、实现偏离既有方案、探索是否围绕关键未知；没有显式方案时保持相应维度未审。 |
| 3 架构与决策方向 | 是否结合实际项目约束判断职责／边界／复杂度，识别无效绕路或过早改动，给出有依据的继续／调整／重规划／补证据建议；不制造无依据架构问题。 |
| 4 反例、恢复与验证完成 | 复现／反例是否来自需求而非错误oracle，是否正确区分环境故障和产品缺陷、利用后续成功更新判断，是否发现测试覆盖和完成证据缺口。 |

每轮记录逐维度状态：未获观察机会／输入不足／已观察正常／发现具体问题／修复待实测。评价判断的来源、问题与影响是否成立、建议是否可用、是否重复／噪声／错误阻断，以及主模型实际后续动作（如可见）；建议数量、投递次数、单题官方通过都不代替能力质量。假设、事实、独立验收继续分开。

下一轮可由真实可复现问题的修复驱动，也可针对尚未覆盖维度提出新的明确观察问题；无变化重复相同已覆盖观察不得成为循环理由。优先复用当前单题自然出现的阶段，不能为覆盖强行伪造方案／失败、绕过安全边界或无上限扩大调用。样本无法覆盖的能力明确保留未验证，不把一个用例当作全维度效果证明。收敛依据是全维度已有证据及明确剩余限制，或真实阻塞；基础链路正常只结束阶段1。

迭代证据补充：Round002发现泛泛“先浏览仓库”意向＋目录列表被当作技术方案，提前用掉预算。最小修复将这种泛泛单句留在探索意向层；具体技术／多步方案不受影响，实际Read/Grep证据仍按原门槛触发。228宿主＋全普通检查及原输入免费重放通过；provider未回答尚未解释，不能以本地修复声称其解决。

### 按观察轮次集中优化（用户最新效率要求）

一次真实单题观察应统一审计所有自然出现的能力与多个问题，不只寻找一个问题。优先复用同一份需求／公开轨迹／工具结果／审查输入输出，形成问题清单，逐项区分事实、复现、影响、依赖和未知原因。

证据充分且互不影响的修复集中在一个开发批次内完成，不为每个小改动分别启动付费模型。每项问题仍先有能独立暴露错误的失败回归，再做最小修复和对应验证；相关联或有先后依赖的问题顺序处理，以免混淆根因。批次结束统一运行全部`node scripts/check.mjs`，通过后冻结一个新版本、一个新结果目录，用下一轮一个双失败用例的两组运行共同观察本批修复。

每项修复保留独立验证依据；组合变化无法区分影响时标为归因不确定，再用免费回放／测试定位，不立即追加付费实验。不得把尚无证据的猜测或无关功能混入批次。基础链路、上下文、判断、行动、反馈和预算可在同轮一起审计，但没有自然机会的维度仍未覆盖。该方式优先于旧“每轮只最小修复一个问题”的执行口径，不改变运行保护、预算、模型身份与单题范围。

当前迭代状态：Round003已完成，集中修复大输入日志截断和宿主失败原因丢失，232宿主及全部普通检查通过；同native的断网模型API／两层网关固定回复检查均成功且0付费。三轮真实审查均未在原30秒活动预算内取得有效输出，完整真实上游回执缺失，无法据此判断各维度质量或认定供应商根因。暂不追加第四轮，不调整effort／预算猜测；保留隔离分支、45份关键原文件hash和全部原始回执，报告明确全维度目标尚未完成。当前无活动评测任务，结束这次自动轮询；后续付费验证须先取得足够的真实调用路径诊断依据。

2026-10-16用户再次明确继续，并授权瓶颈时使用GPT-6-Astra（额度中断后也已明确要求续做），优先于上一段停止跟进。只读诊断已找到取消请求不生成CCR trace的记录机制，仍未解释30秒回复缺失；不改全局Router。集中修复评测gateway取消误分类并补有限传输边界元数据，真实loopback RED→GREEN，232宿主及全普通检查通过，原45hash不变。下一次单题只能以完整prepared输入／typed宿主失败／headers首字节取消边界这一新观测问题开展；不改预算、effort、模型或目标，不把诊断完成当全维度完成，不自动full或重复同批。详见迭代报告。

Round004已完成2/2及行为审计：原30秒内宿主aborted、本层未收到CCR headers／body、0有效判断；七维质量仍未观察。真实分段输入受宿主sessionId脱敏损坏，已免费原生复现并修复为明确省略会话ID的诊断表示，actual input／Binding不变，234宿主＋全部普通检查通过。四轮60关键hash一致。修复未证明解决真实回复缺失，当前无活动任务；停止无变化付费和自动第五轮，保留真实阻碍，不将观测性完成当核心能力验收。

### 新方向：异步历史审查（设计待审阅）

用户随后提出取消审查模型超时，并让输出注明结论依据的执行截止位置，主模型可利用历史意见纠正。此方向优先于先前建议的120／180秒参数方案；不是直接删除常量后继续阻塞主模型，也不允许旧事实认证当前代码。具体草案见[带执行参考点的异步历史审查](../specs/2026-10-16-historical-review-design.md)：后台冻结材料、固定参考点、同任务执行前进保留历史建议、身份变化／取消结束工作、模型等待与工具执行预算分开。宿主跨hook后台存活、追加反馈及headless生命周期先做免费可行性验证。当前仅设计，未实现、未开新付费轮次；待审阅后另写实施计划。


### 最新循环状态（2026-10-16，覆盖上文历史停止／设计状态）

异步历史接入已实现于91c8722并完成免费原生生命周期验收与一次6.1sol整组审查修复；用户明确要求继续单题循环，旧禁自动第五轮及设计待审阅状态不再适用。Round005固定抽Flipt c172两组各15分钟已2/2自然结束审计；侧调用106555ms timeout=null，actual prepared输入可核对，但只有thinking／max_tokens停止，无最终JSON和判断。原来的4000输出上限预留只计public requested2000，而同native实际wire4048，是下一批确定要修的本仓库集成问题；不能称本轮实际严格守住4000。还需修复usage阈值不能直接证明provider截断的诊断。预算不扩大、模型不更换，不改Claude Code或全局Router。两项实证问题集中TDD＋全部普通检查后，再冻结版本／out按单题规则观察，不为小改动分别付费。全维度能力质量依旧未验证。agent只用6.1sol。


### 2026-10-16 Round005 后：公开宿主输出预算兼容批次

两项实际问题一批处理：公开 maxTokens2000 在未修改的 2.1.295 原生调用中成为 wire4048，Coordinator 只预留2000；usage>=请求上限又被误当供应商 stop reason。已完成同冻结 Linux/Node/GNUloader 断网五组复现，不修改宿主或 Router。

采用最窄公开 API 方案：语义模式仅接受 session.version 精确2.1.295 且显式 Flash 的已验证组合；requested1952+host allowance2048 预留4000，保守不退款，因此一次调用即耗尽共享输出预留（仍符合最多两次上界）。未知组合保留规则并明确 abstain，不猜测 wire cap；existing/facts 旧路径保留但不宣称已验证 wire 上限。公开 effortlow 作为下一轮受控兼容性问题：只证明 output_config 已发出，不保证供应商理解、减少 thinking 或返回 JSON。拒绝额外 side-only gateway clamp：缺少透明且已验证的旁路边界，不引入第二传输语义。

分别记录 requested、wire-known、reserved、observed usage、host reason 和 providerStopReason=null。超出预留的实际消耗补扣并关闭后续派发，不把无法挽回的已消费超额说成提前阻止。usage 超过公开 requested 但未超过预留且有完整回答，仍走原 JSON/来源/Binding 验证。新版本查询的异步取消边界也须覆盖，不能让旧任务查询完成后预支新任务预算。

批次本地回归先 RED 后 GREEN；统一全部普通检查、生产插件断网原生固定回复、原75关键hash保全后，才允许新冻结 source/out 的一个双失败 E/S 观察。下一轮问题是 wire4000/公开low实际交互、可解析历史判断与投递，及所有自然出现维度；不求官方通过，不自动 full。


### 2026-10-16 Round006 后：探索时机／协议模板／预算跳过一批修复

Round006已完整2/2，真实low请求4000、3999ms返回99output公开text，但围栏JSON缺少两项checkpoint标识，0判断投递。首次材料仅目录与三条Grep No matches found，却被视为两份实质来源；后续准备了未派发的实现输入，被误记review-unanswered。按用户“一次观察多问题”的要求，同批各自RED→GREEN：仅原生完整负面Grep不计探索触发但保留证据；响应模板给出一个完整可解析对象（包括原样标识）、明确无围栏，不放宽parser；预算不足先跳过，不制造prepared／provider未回答。

269宿主GREEN后统一完整node scripts/check.mjs和免费实际prepared输入重放。新source/out后才下一轮一个固定seed双失败E/S，新的具体问题是触发材料充分、响应遵守原样标识与JSON、预算诊断；所有自然维度并审，仍不求官方通过。不把null judgment当错误建议，也不把无有效输出当七维正常。


Round007已按以上批次完整门禁启动：source66dffe8，269宿主及全部普通检查通过、免费真实输入回放、90旧hash保持；固定seed47262fd5849a608b6986da03ec534969抽Proton e65两组各900秒。2026-10-16T14:15:53Z并行starting，controller14248／monitor14251。等待自然完成后统一审计，不重启、重抽或叠加full。


### 2026-10-17 CST：Round007审计完成，下一批probe契约修复

007于2026-10-16T14:33:24Z已2/2结束，无活跃runner。首次一条严格通过的历史探索判断、一次context返回和实际下一主模型请求可见；部分请求的读取已在投递前完成，采纳／改变决策unknown，不能当全维度达标。完整报告与105冻结hash已保存。

下一组实证问题：真实probe把现有路径字符串填到生成脚本files，并给出协议不允许的grep管道；历史降级保留判断是正确行为，但action=probe计数没有独立表示候选协议有效性。先集中TDD补清公开提示的files对象／生成脚本范围／已有命令限制，并给历史结果独立纯协议诊断；不执行历史动作、不自动修复候选、不放宽gate或命令。完整普通检查和免费真实候选回放后才新source/out单题观察，不立即追加008，更不重跑007。


Round007契约批次已实现：明确probe生成文件对象和现有命令限制，纯actionProtocol状态独立进入历史／当前结果及REVIEW事件；历史判断保留、旧候选不执行。RED269/4→GREEN273及全部普通检查通过；同冻结Linux断网真实候选回放0模型／0执行，105旧hash保全。下一轮新source/out单题只验证提示遵守和动作诊断及自然维度，不求官方通过、不自动full。


Round008已完成免费门禁并唯一启动：source3a4c224，seed1cb72b2bae465af5b8213a8f92c9fd6b固定抽Protone65，E/S900000ms并行2槽2026-10-16T16:49:32Z starting，controller41340/monitor41343。目标probe契约遵守、纯协议诊断与历史适用分开及全部自然维度，不预设模型成功；自然结束审计后才下一批决定。


### Round008后：在固定预算下按阶段观察未覆盖能力

008已2/2完整审计，有效历史探索location候选、下一真实主请求可见，candidateprotocol与历史适用独立正常。没有probe行为，不能认证files/command遵守；后续真实implementation／failure都被一次预留耗尽跳过。主模型已在建议送达前完成多项读源，效益unknown。原120hash保全，无活跃任务。

下一批是已授权全维度分阶段观察的最小准入选择：可配置review_phase，默认auto维持现状；选定plan/exploration/implementation/failure/completion时，只在原证据规则判断为该阶段后准入，不提前预留／发模型、不自动fallback、不伪造方案。阶段选择不收窄判断维度，同次审查仍看全部当时可用材料；取消／绑定／独立执行／4000wire／无模型等待timeout均不变。生产插件、冻结runtime身份及实验配置要绑定同一选择，未知选择必须拒绝，避免配置声称目标阶段而实际auto。

本地RED覆盖：早期实质探索延后不消费；真实目标阶段一次调用；编辑未检查不能冒充implementation；无明确方案不能满足plan；取消／off／预算边界保持；目标未发生不回退；默认auto兼容；冻结配置与identity不同拒绝。免费用008真实公开轨迹核对探索被延后而implementation可准入，0付费不重建旧工作区。批次全node scripts/check.mjs通过后才新source/out抽一双失败E/S；优先implementation的质量问题而非重复探索。此处仅后续设计，尚未实现或启动009。


阶段准入批次已实现，默认auto、选择阶段不增预算。280宿主及完整普通检查通过；冻结phase绑定／mismatch控制和同冻结Linux断网008真实公开轨迹回放通过（16088字符真实改动＋编辑后成功check，早期延后、implementation准入），0paid／0项目命令。120原hash保持。下一轮新版本固定抽一双失败，supervise仅implementation时机；目标为改动／架构／方向／验证等实际判断质量，缺方案仍不虚构一致性，不求官方pass。


Round009唯一启动：sourcea87caad，seed9a4a12c8a9940428d0f926f794cc1dad固定Fliptc172，Eauto/Simplementation，900000ms两槽2026-10-16T17:29:29Z starting，controller44171/monitor44174。280全普通/nativepreflight2738ms0paid等门禁完整。目标实施阶段实际材料与判断，不自动回退或追求官方pass；先自然完成审计再下一批决定。


Round009已完整审计：阶段准入实际生效，首次verification有根据地指出no-op stubs不能证明真实CUE／精确错误行为；probe协议有效未执行，部分措辞（Unify返回值、only/ever全历史断言）精度不足已记录。回复在固定外层结束前queued，无下一主请求，0投递，不能称实际纠正。135关键hash保持。下一明确未答观察问题为失败诊断／恢复方向，选择同实现review_phase=failure的新冻结轮；仅配置阶段变化，旧280完整检查覆盖其准入，不无变化重复implementation，不因措辞小改逐次付费。


Round010仅新阶段观察启动：source4490434报告提交／产品a87caad未改，Sfailure/Eauto，seed311776c46b0a15b71b8ba0a4930c6fbe固定Protone65，17:58:01Z两槽900000ms，controller45821/monitor45824。dryrun2/nativepreflight8083ms0paid/135旧hash及原280fullchecks绑定；不得声称微小措辞修复或加预算，无目标不强制回退。


010最终无合格失败检查，0审查，恢复质量未观察；150原hash保全，不重复同阶段碰运气。009来源复述／全历史负断言精度问题已集中修正提示与反馈边界，保留原判断／原文，未引入自动事实裁决。RED280/2→GREEN282及全普通检查、真实009公开输入回复的断网对照均通过；不是模型质量已修复。下一新source/out选implementation观察真实改动和历史遗漏下的忠实度／范围及自然维度，没目标不强制，仍一双失败E/S900s，不自动full。


Round011新代码验证唯一启动：sourcead2f994、seed273726c6a6889c2f10109ec20ca8c167固定Protone65、Simplementation/Eauto两组900000ms，2026-10-16T18:21:47Zstarting，controller48171/monitor48174。282全普通检查/实际009回放/nativepreflight8167ms0paid/150hash门禁已通过；审来源忠实和范围，不先声称模型行为修复。


Round011已于2026-10-16T18:39:17Z完成全部审计：S23Bash/19Read/4Grep/2Glob无EditWrite/编辑后检查，implementation阶段无机会，0prepared/0side/0判断/0投递；两组900s空patch，官方3parsed/3required整体failed仅描述。ad2f994产品修正仍只有282普通检查/免费真实009机制回放证据，没有真实模型遵守证据；不得称质量达标。165原始criticalhash核对保持，完整usage/costunknown。再次缺自然目标材料后按既定规则停止无变化付费，删除automation，不启动012/不重抽延时加预算；全维度未覆盖及既有有限判断限制详见评测报告。恢复需新的可复现问题或明确解决覆盖限制的观察设计。本次只补报告无代码修复，无活跃runner/容器。


### 2026-10-17：用户批准自然结束与多问题自然语言报告

用户明确要求取消15分钟主任务截止，允许主模型自然结束，并允许审查一次用自然语言汇报多个问题。该授权取代旧900000ms观察约束；旧冻结结果不改标、不重跑。已在现有流程内修改：新SWE Pro默认task-timeout-ms none，JSONtimeoutMs=null，底层不创建任务截止timer；显式数值截止仍兼容，评分／准备／隔离工具各自时限不变。既有语义驱动等待审查终结及有限后续回合后再关闭原生输入，取消／进程错误仍终结。

审查默认自然语言或Markdown，按影响报告所有重要且互不重复的问题，不强制类别、字段、精确需求摘录或回显ID。插件绑定真实检查点／材料范围，正文解释未经独立核验，不从正文推断维度已审或正确。旧严格判断解析保持兼容；生产显式准入自然报告（24KiB文本上限，仍4000wire输出预算）。可选report+action JSON仅为机器动作；非none动作仍须准确检查点身份，且经过既有来源／命令／隔离gate。无效可选动作保留正文并记invalid-protocol，正文命令不自动执行，历史动作不认证新源。没有按问题数量限制；输出总量和调用预算维持原值。

本批先RED四项宿主行为（282pass4fail）与自然完成默认RED3000000≠null，GREEN287宿主及全部node scripts/check.mjs。测试含多问题原文投递、无分类／回显、可选动作身份错误／危险路径拒绝且正文保留、历史／取消／零执行、默认none／显式数值／null不成为1ms timer。旧一条测试将not json视为无效的断言已按用户新语义改为真实敏感输出拒绝；没有放宽隐私。作者TDD+diffreview，旧freshreview不覆盖本批，不再反复派reviewer。

完整检查后进行同冻结Linux CLI／Node／GNUloader断网35秒晚到双问题正文回放，再冻结新source/out单题E/S自然结束。实际是否报告多个有依据的问题、是否进入后续主请求、自然完成及所有自然维度仍需实测。无人工阶段／失败伪造，不增输出预算，不追求官方pass。后续报告将自然结束轮与旧限时轮明确分开。


Round012唯一新条件实测已启动：source8ed8920bb37751fbf3858b9d688a85223d06848d、seedba1ac1c271d69796fd210ed745021b32固定抽Fliptc172，Eexisting/Ssupervise并行2槽、Simplementation；主任务none/null等待自然结束，不再按旧15／50分钟取消。controller55904/monitor55907，02:40Z环境免费校准中。287完整普通检查/35秒晚到双问题自然正文回放/nativepreflight2823ms0paid/165旧hash门禁完整。下一步等自然结束统一审计实际多问题内容、历史范围、反馈可见及所有自然维度；不把合成机制或启动当质量成功，不自动full/重试。automation已用新语义恢复。


Round012已03:18:16Z两组自然完成与完整审计，E约17分34秒／S25分21秒，官方0parsed/2required命令失败仅描述。真实37288ms/9140in1266out的4765字符自然报告有4个编号项、一次投递、14真实后续请求可见，主模型明确回应；scratch方向已在反馈前决定，采纳改变／质量效益unknown。有效依赖验证警告与已解决历史／hidden-test猜测／无行动选择噪声分开；无明示方案，不认证全维。旧CHECK三次none has passed since引发主模型重复／反驳，需按真实scope免费复现，不放宽失败gate。180关键hash保持，rawpending不改，controller／容器全退出，不重跑012/audit。下一批先免费实际scope／长命令诊断及报告triage证据，再TDD集中最小修正+全普通检查，暂无013。


### 2026-10-17：检查范围完整性与报告取舍批次

免费round012-scope-diagnosis在同冻结Linux／networknone下，仅把实际公开检查／编辑记录作为数据送入生产evidenceOf／contradictions，0模型／0项目执行。确认原617字符失败命令和497字符后续命令有相同200字符显示前缀；7条实际检查只保留6个不同命令，真实runner尾部丢失。另一个235字符成功命令的scope也被截坏。与此同时，即使对比完整命令，完整stub suite的失败仍未解决，所以不把全部重复提示归咎截断、不把Valid局部成功说成整套通过。

本批将安全且不超过4096bytes的原始检查命令完整保留用于scope身份和recheck，只有呈现文字截短；超长或脱敏会改变的命令明确commandComplete:false，不作为可执行recheck／自动成功证据，也不能因显示前缀相同合并或用其他scope成功关闭。保持严格scope比较，不猜复合命令之间的包含关系。failed-check／unreported-failure和关闭说明改成“记录中的某检查范围仍失败／需要匹配范围”，不再说最后一次检查失败或此后没有任何成功。

报告提示要求问题列表聚焦未解决且有实质影响的关注，把已修历史作为反证，不为无行动选择或假想hidden grader制造要求。仍允许没有失败测试但有观察到的设计权衡／具体后果的架构和方向建议；自然语言和所有重要问题保持，不加数量或类别限制，不重写模型原报告。

六项行为回归RED287pass6fail；新完整性／privacy控制GREEN后，旧宿主8项文字断言按准确新措辞更新（非行为gate退化），关闭说明另有RED291pass2fail，最终293宿主及全部node scripts/check.mjs exit0，日志scope-triage-final-checks.log。作者TDD+diffreview，旧freshreview不覆盖。本次没有放宽执行、隐私、绑定或预算。

scope-triage-native-replay/receipt.json按实际012记录对照冻结旧／新helper，0paid／0项目命令：原6个不同记录变为7个，所有实际有界命令原样保留；完整stub测试失败保留且措辞限定scope。实际012正文和输入context原样保留，triage提示新增。仅机制证据，不证明真实模型会减少噪声或改正所有范围断言。

下一轮新问题是完成阶段：012早期审查用尽预算，后续最终答复仍对未实际运行的CUE行为作确定性描述。选择Sreview_phase=completion，保持每次审全部可用维度、不增加预算，观察最终验证声明、报告取舍和晚到反馈排空。先用断网原生夹具证明仅在main最终答复后首次发审查、等待晚到双问题报告并有限follow-up自然退出，再新source/out随机一双失败E/S。新轮与012implementation条件分开，不声称默认auto效果。主任务始终none/null自然完成，工具／评分原时限不改，不自动full，不重抽或接受失败重试。


完成阶段原生夹具已验证：firstside在main5最终答复后，真实REVIEWcompletion，35036ms晚到双问题正文、main6同时可见、2results自然exit0，0paid／0候选执行。Round013唯一启动sourcead666bf、seedf17880c6961d578ffa693e9fe6c41f7a固定Protone65、Eauto/Scompletion并行2槽、none/null自然结束，controller59220/monitor59223，03:36:54Z环境校准。293ALLordinary/实际scope回放/完成夹具/180hash/nativepreflight8117ms门禁完整。仅观察新范围／triage修正及最终声明，不宣称质量已改善；本轮有真实代码修改但时机与012不同，分开记录。


### Round013：自然完成与完成阶段反馈审计

2026-10-17T04:34:36Z两组2/2自然完成、基础及完整行为审计结束，controller59220/monitor59223和容器均退出。E2701623ms（约45分02秒）18008Bpatch／S3073671ms（约51分14秒）23136Bpatch，原生exit0；官方E1parsed/3required、S2parsed/3required overallfailed，仅描述，不推断三项逐一失败或监督收益。保持none/null，不靠旧时限终结。

S首次完成阶段实际调用38335ms／无插件timeout／4609in1744out／wire4000low／Router200end_turn，一份prepared与实际Routercontext省略sessionId后逐字一致。4837字符自然报告四项加design note，正文含围栏JSON建议仍是文本，不提取执行，actionnone/not-requested、0facts。04:28:51.605queued／.709submitted，04:28:51.767真实下一主请求完整可见，后续7hits是一次反馈。主明确逐项回应，补读源码、正确捕获tsc exit0、纠正5new+44preexisting为5new+39preexisting，并在纠正首次错误cwd后用pristine39tests复现open-handle警告；没有反馈后实现编辑。可见验证／报告动作改变，但独立任务质量效益unknown。

报告正确限界“提供记录没有源码／tsc证据”，计数错真实；完整轨迹其实04:18:54已有tsc PIPESTATUS0，因此补跑部分是有限材料造成的冗余。开句柄警告存在，但“likely retry timers”仍是假设，基线反证不证明新代码毫无影响。design note把reset权衡留在非缺陷说明，未虚构hidden-grader需求。无明示技术方案，需求—方案／方案—实现输入不足；探索／方向／验证有部分实际观察，架构／精确时序及需求反例未验证，恢复仅退出码与cwd纠正。最终主答仍将React useEffect等同同一dispatch内同步发出，不能认证该严格时序要求；官方失败不归因于此。晚到完成审查及有限follow-up已真实自然完成，链路健康非全维达标。

新可复现材料问题：真实36条改动中2条触发既有脱敏规则，聚合23958byte小于24576上限，却导致34条其余安全改动一起change-unavailable。同冻结Linux／networknone／0model／0项目执行的round013-material-diagnosis与privacy-details复现；20KB控制仍拒绝，非此次大小上限原因。未降低隐私或复制敏感值。下一批只保留独立通过原隐私检查的有界改动原文，明确遗漏隐私／预算部分；不更改实际任务代码，不把部分材料认证成完整当前diff，不增加预算。

Router301window/301bodyparsed，244原需求匹配＋40仅内存S绑定＝284归因Flash200，17不归因；本地E128requests109starts／S175requests134starts，全部实际身份Flash。673资源样本min6788026368B/swap0/OOM0/no429，完整usage/costunknown。新增15criticalhash累计195保持；原pending快照不改，behavior-status另存终结。基础audit不重跑，原输入／报告／patch不修改。下轮只在实证批次RED→GREEN＋全部普通检查与免费实际材料回放后冻结新版本，不立即无变化付费。


### Round013后：安全改动材料独立保留批次

按实证只修材料准备：legacy changesOf继续用于原验证／阶段判定，独立reviewChangesOf逐条保留通过原redact相等检查的有界原文片段，隐私不安全条目省略；以UTF-8 bytes控制24576总预算，超预算记录明确省略。context.scope与input/feedback前置说明privacy-affected-changes／change-record-budget，不把部分历史片段认证为完整当前diff，不读真实工作区文件、不改来源／动作gate／调用预算。

三项生产宿主RED293pass3fail（混合安全/敏感、全敏感拒绝、多字节预算）→GREEN296pass0fail。首次实现material局部变量重名导致模块不解析，改为changeMaterial后全部宿主通过；非宿主/模型故障。完整node scripts/check.mjs material-batch-final-checks.log exit0：296宿主、类型、manifest、真实隔离和全部scorer/runner普通检查，不缩减。作者TDD+diffreview，旧freshreview不覆盖此批，不反复派reviewer。

免费material-batch-native-replay同冻结Linux/Node/GNUloader/networknone、0model/0项目命令，对真实013改动重放：旧聚合23958bytes因隐私整份拒绝；新恢复24315bytes且redact逐字不变，包含pendingActions/retryStale原文，隐私与预算遗漏均标明。只是材料机制恢复，不证明真实模型会识别同步dispatch/直接retry等精确时序问题。195旧criticalhash保持。

下一单题沿Scompletion，明确问题为安全源码/改动片段恢复后能否给有依据的实现与严格时序判断、反证及可用建议；全部自然维度一起审计，无方案仍不伪造。新source/out门禁完整后才启动，不以报告修正当实现修复或官方pass。


### Round014：恢复安全改动材料后的完成阶段实测启动

冻结sourceefa25970f32d0a683252adff84d269bbb369e5eb（真实产品修改），seedeb41dbae58437aeb76a44793feca04d8从最新完整caller-scope full4固定一次抽Fliptc172，父summarySHAa2c437f9785105429f1e4c3ba4de9e9e8a533c0c3e58e5af70be6006ae09d676。Eexistingauto/Ssupervisecompletion并行2槽，主任务none/null自然完成。唯一controller63525/monitor63528，2026-10-17T04:45:28Z开始免费环境校准，尚不声称两模型已运行或质量成功；最新PID文件优先。

296宿主+全部node scripts/check.mjs、实际013材料断网新旧回放（恢复24315byte原文，隐私与预算遗漏明确）、195旧hash、dryrun2/nulltimeout、同冻结原生preflight2855ms0paid均绑定launchgate。原生CLI/Node/GNUloader字节不改，主旁Flash、预算/effort/自然语言多问题/历史来源和执行gate不改。问题为实际材料恢复后是否能核对实现与严格时序、避免只审主答自述；所有自然维度并审，缺方案不伪造，不以官方pass为目标。本轮抽题不同于013，不能把分数差直接归因修改。旧001..013均结束，不重跑audit/原回执，不自动full/重抽/接受失败重试。自然结束后基础audit再完整行为审计。


### Round014 final audit and invocation-classification batch

Round014 completed naturally at2026-10-17T05:25:21Z,2/2 basic+behavior audited, original controller63525/monitor63528 and containers exited. E941283ms/7174Bpatch; S1627233ms/5430Bpatch, both native exit0. Both official commands failed with0parsed/2required, not two individually parsed failures. Actual S context includes4793characters of recorded change plus requirement/answer/six tools, no explicit plan; exact Router match after documented sessionId omission. No private record occurred in this task, so the mixed-private mechanism remains supported by free actual013 replay rather than this live task.

One semantic call40348ms, timeoutnull,6445input/1418output, wire4000/effortlow/Router200end_turn produced4499characters with4concerns. Queued05:17:56.480, context-returned05:18:00.445, next real main request05:18:00.484 contains the report;2hits persist ONEdelivery. No explicit acknowledgment or post-feedback tool/source edit. Final answer more explicitly discloses stub-only compile and unverified real CUE behavior; no implemented repair or independent benefit established. Useful dependency/exact-error verification gap remains. Never/consumer-will-fail claims exceed actual evidence; repo-root fixture grader speculation has no requirement source. Schema optionality and parse-error test nuance are nonblocking notes. No plan-to-code evidence; architecture/direction/verification limited, recovery/counterexample execution still unvalidated.

Router123window/123parsed;75full-instruction+27in-memory S-bound=102attributed Flash200,21unattributed. E51requests29starts/S73requests45starts.465resource samples/min10199121920B/swap0/OOM0/no429. Complete usage/costunknown.15new critical hashes total210verified; original controller pending snapshot preserved with separate final behavior-status, no repeated basic audit.

Actual CHECK1..4 repeatedly targets an invalid Go -modfile filename. Free actual-prefix replay identifies the argument rejection, but removing it still leaves a genuine earlier single-build scope unresolved under strict compound-scope identity. Do not attribute all noise to invocation classification or infer compound inclusion. New narrow code treats only an exact single Go build/test/vet literal-modfile diagnostic as no project-check execution. Raw failed command attempt remains; no pass certificate. Genuine errors, mismatched diagnostics, mixed output and multiple checks retain old constraints.

Regression RED initially296pass3fail included a negative fixture missing exit status; corrected fixture RED297pass2fail -> GREEN299pass0fail. ALL node scripts/check.mjs invocation-batch-final-checks.log exit0. Author TDD/diff review; prior fresh review does not cover this batch. Free invocation-batch-native-replay same frozen Linux/networknone/0model/0project: actual10runs->9, all failed attempts retained, invalid invocation removed, genuine missing-module failure and unresolved strict scope retained. This is classification improvement, not elimination of all warnings. Product commit2686906; docs command encoding failure was separate from production validation and corrected in this report.

Next different core question: failure-stage cause separation/recovery under natural completion. Old010was15minutes with no eligible failure. Actual014has source plus a genuine missing-module/build failure; free failure-phase-native-replay confirms that prefix is eligible under existing failure gate, completion deferred, actual change+failure supplied,0paid/0project. Future random task may have no target; do not force/fallback/extend. After new freeze/out gates, Sfailure observes evidence-based recovery/next question instead of repeating failed commands, all natural dimensions still audited, no extra budget. If no opportunity or unchanged unknown remains, no repeated failure fishing.


### Round015 launched: natural failure-stage cause separation

Unique root eval/results/review-iterations-flash/round-015, frozen source660ba164945d1143ed6870809f219160f01cc265 (audit docs plus product2686906f10d02d23c0d4641b2e2e7714203c9d87). Seed73e9ddb1651955c056290713f20fe587 drawn once from latest complete caller-scope full4 selects Fliptc172, no redraw. Eexistingauto/Ssupervisefailure, runtime/experiment/audit bound; this is neither defaultauto nor014completion effect.299host+ALLordinary, actual invocation replay, actual-prefix failure eligibility replay,210protected hashes, dryrun2/nulltimeout/nativepreflight2790ms0paid bound in launchgate. Unique controller66683/monitor66686 began free environment calibration2026-10-17T05:36:03Z, not a model-quality result. Natural none/null main completion; no budget/model/CLI/Router changes.

Question: on a genuine failed project-check checkpoint, can the side model distinguish invocation/dependency/stub/environment from implementation, preserve counterevidence and supply a useful recovery question without simply repeating failure? Existing gate unchanged; no target means no opportunity, no fallback/forced trigger/extension. Old010failure run was15min without a qualifying target, whereas actual014natural trajectory supplies such a prefix (free mechanism proof only). No paid repeat merely for the narrow Go classifier. Audit all natural dimensions after both arms finish; official status descriptive, no pass goal; no second runner/old restart/accepted retry/full.
