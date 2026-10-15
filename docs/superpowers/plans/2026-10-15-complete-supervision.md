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
