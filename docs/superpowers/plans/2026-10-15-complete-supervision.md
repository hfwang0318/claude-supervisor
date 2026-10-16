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
