# 新开源任务与空间清理（2026-10-21）

## 空间清理

- 项目目录从 1.6 GB 降到 **784 MB**；
- Docker 镜像从 135.9 GB 降到 **110.9 GB**；
- 根分区可用空间从 6 GB 升到 **29 GB**。

保留：

- 21 个含失败样本的任务镜像；
- 4 个纯成功代表任务；
- 失败样本、报告、产品代码。

删除：

- 9 个纯成功任务镜像；
- 与项目无关的 Docker 镜像；
- 重复 runtime（`runtime-dl`、`runtime-deepseek`）；
- `.dsh-screens`；
- 对应成功结果目录。

清理清单：`.superpowers/sdd/phase0-rebuild/cleanup-2026-10-21.json`

## 新引入的上游任务

从固定 commit `66f92766` 的 SWE-bench Pro 仓库引入：

| 任务 | 来源 | baseline |
|---|---|---|
| flipt-518ec | flipt-io/flipt | passed |
| navidrome-3977 | navidrome/navidrome | passed |
| flipt-2ca5（hard51） | flipt-io/flipt | 官方测试准备超时，未得到结果 |
| navidrome-69e0（hard51） | navidrome/navidrome | passed |

两个普通任务主模型都能直接通过，因此不构成失败样本。

## 新失败样本：navidrome 哈希种子

在 navidrome 的通过补丁上，把：

```go
hash.SetSeed(h.globalSeed)
```

改成：

```go
hash.SetSeed(maphash.MakeSeed())
```

结果：

- 补丁可编译；
- 官方 `TestHasher` **failed 1/1**；
- reviewer 产出 1 条 finding；
- finding 的 `current/required` 精确对应两行；
- verified gate：**1/1 verified，0 invalid**；
- 正确补丁 gate：**0 verified，1 refuted**。

这是新仓库上的“语义条件改错”失败样本，不是自然失败。

## 当前限制

- 新引入的两个普通任务 baseline 都通过；
- hard51 flipt 卡在官方 verifier 准备阶段；
- 新失败样本仍是构造的，不是自然发生；
- 需要继续挑选主模型实际会失败的上游任务，而不是只靠条件变异。

## 自然失败：ansible hard51

从 hard51 拉取两个 ansible 任务，官方 baseline：

| 任务 | facts 结果 | 说明 |
|---|---|---|
| ansible-40ade | failed | 模型补丁 0 字节，没有实际修改 |
| ansible-c1f2 | failed | 模型补丁 26,473 B，新增 F5 message routing 模块 |

ansible-c1f2 是真正的“有源码改动但官方失败”：

- 模型新增了 `bigip_message_routing_route.py`、fixture 和测试；
- gold patch 只新增 `bigip_message_routing_route.py`；
- 官方测试仍失败（6 个 fail-to-pass）。

reviewer 对 26 KB 补丁连续两次采样均为 **0 findings**。这是目前最重要的 reviewer 盲点：

> 没有失败测试输出时，reviewer 难以从一个 531 行的新模块中定位实现错误；它只能读 patch 和需求，不能执行 hidden tests。

因此该样本暂时不能形成 verified finding；下一步应把“官方失败测试名/输出”作为 reviewer 的受限输入，或增加针对模块结构的 probe。

## 失败摘要输入 + control-only probe

ansible-c1f2 的 reviewer 在只有 patch/需求时连续两次 **0 findings**。

把真实 pytest 失败摘要作为受限输入后：

- reviewer 产出 **2 findings**；
- 第一条定位到 `ModuleManager` 没有把执行委托给 `get_manager()`；
- control-only probe 选中 gold 中的：
  `return manager.exec_module()`
- candidate 缺少该行，control 有；
- verified gate：**1/1 verified，0 invalid**；
- 正确补丁 gate：**0 verified，1 refuted**。

这是本轮最重要的结果：

> 对自然失败，失败测试摘要能显著提升 reviewer recall；再用 gold/candidate 的 control-only 行生成执行断言，可以把自然失败转成 verified finding。

限制：

- 失败摘要目前是人工截取的，不是产品自动输入；
- control-only probe 可能选到无关差异，需要按 finding 文本打分和更多样本验证；
- 该策略尚未进入产品代码，只是在评测 pipeline 中验证。

## 自然失败 repair：reviewer-only fail→pass

ansible-c1f2 自然失败上跑 repair A/B（240s）：

| Arm | 结果 | Patch |
|---|---|---:|
| reviewed（带失败摘要 + finding） | **passed 6/6** | 26,750 B |
| generic | **failed** | 26,473 B |

generic patch 与原始模型补丁同为 26,473 B，说明它没有产生有效修复。

完整链路：

1. 原始模型补丁官方失败；
2. reviewer 无失败信息：0 findings；
3. 加入精简失败摘要：2 findings；
4. control-only probe 定位 gold 的 `return manager.exec_module()`；
5. verified：1/1，正确补丁 0 verified；
6. reviewed repair：**fail → pass 6/6**；
7. generic repair：仍 fail。

这是目前最强的自然失败证据：失败反馈既提升了 reviewer recall，也带来了 reviewer-only 的 fail→pass。

## 追加 hard51 任务

| 任务 | 结果 |
|---|---|
| ansible-d33bed | facts 臂 10 分钟超时，补丁 0 字节，官方 failed；不是“有源码改动”的可用样本 |
| navidrome-bf2bcb | facts 臂 passed，主模型能解决 |

因此当前唯一可用的自然源码失败仍是 ansible-c1f2。它已经完成 reviewer 0→1、verified gate、reviewed repair fail→pass 的完整链路；下一步应优先寻找更多“有补丁但失败”的任务，而不是继续增加 0 字节超时样本。

## 第二个自然源码失败：openlibrary-0dc5b

| 项目 | 结果 |
|---|---|
| 模型补丁 | 3,667 B |
| 官方 | failed，59/61 必需测试通过 |
| 缺失测试 | `test_xml[onquietcomedyint00brid]`、`test_binary[onquietcomedyint00brid_meta.mrc]` |
| 失败摘要 reviewer | 1 finding |
| verified | **1/1** |
| 正确补丁 | **0 verified** |

reviewer 定位到 `read_author_person` 的 tag 传递；control-only probe 选中 gold 中的 `read_author_person(f, tag='100')` 行并成功区分。

同时修复了两个 pipeline 问题：

- `location` 形如 `parse.py:read_authors` 时，scope filter 未剥离符号名；
- `required` 缺失且没有可执行 probe 时，代码访问 `compiled.command` 崩溃。

自然源码失败现在有 **2 个**：ansible-c1f2、openlibrary-0dc5b。

## openlibrary 自然失败 repair

| Arm | 结果 | Patch | 耗时 |
|---|---|---:|---:|
| reviewed | **failed** | 3,667 B（未修改） | 245s |
| generic | **failed** | 3,667 B（未修改） | 246s |
| reviewed + 失败摘要 | **failed** | 3,667 B（未修改） | 247s |

失败摘要没有诱导模型编辑；trajectory 里主要是 thinking token，未产生 source edit。

自然样本总表：

| 任务 | 失败摘要 reviewer | verified | reviewed repair | generic repair |
|---|---|---:|---|---|
| ansible-c1f2 | 0 → 2 | 1/1 | **pass 6/6** | fail |
| openlibrary-0dc5b | 0 → 1 | 1/1 | fail | fail |

结论：失败摘要能稳定提升 reviewer recall（2/2 自然样本），但 repair 仍依赖任务是否给出足够可执行的局部修复；openlibrary 的跨函数 tag 修复没有被模型落地。

## openlibrary fail→pass：失败摘要必须含 assertion

只给失败测试名时，reviewer 误定位到 tag 传递，control-only probe 虽然 verified，但不是根因；repair 也没有修改补丁。

加入真实 assertion：

- expected `name: 'Bridgham, Gladys Ruth'`；
- actual `name: 'Bridgham, Gladys Ruth. [from old catalog'`；

reviewer 随即定位到 `name_from_list` 缺少 `strip_foc`。

结果：

| 输入 | reviewer | verified | repair |
|---|---|---:|---|
| 只有测试名 | 1（tag，错误） | 1/1（非根因） | failed，未修改 |
| 加 assertion | 2（含 `strip_foc`） | **2/2** | **passed 65/61，306s** |

自然样本 repair 现在 **2/2**：

| 任务 | reviewed repair | generic repair |
|---|---|---|
| ansible-c1f2 | pass 6/6 | fail |
| openlibrary-0dc5b | pass 65/61 | fail |

关键教训：

> 失败摘要只有测试名时会误导 reviewer；必须提供 expected/actual 或关键 traceback，才能定位根因并让 repair 真正落地。

## 第三个 openlibrary hard51

`openlibrary-6e889` facts 臂 **passed**，补丁 4,680 B。主模型能解决，因此不作为失败样本。

自然失败仍为 2 个（ansible-c1f2、openlibrary-0dc5b），两个都已完成：

- 失败摘要 reviewer：2/2 task-level；
- verified finding：3/4；
- reviewed repair：2/2 fail→pass；
- generic repair：0/2。

当前主要问题从“找不到自然失败”转为“失败摘要来源与 probe 精度”：测试名会误定位，必须带 assertion；control-only probe 也只能证明差异，不能证明根因。

## 第四个 ansible hard51 与再次清理

`ansible-e9e600` facts 臂 **passed**，补丁 15,645 B，不是失败样本。

随后删除本轮新增的纯成功/0 补丁任务镜像，只保留自然失败任务：

- 删除 flipt-518、navidrome-3977/69e0/bf2b、ansible-d33/e9e600/40ade、openlibrary-6e889；
- 保留 ansible-c1f2、openlibrary-0dc5b。

结果：根分区可用从 15 GB 回到 **20 GB**，Docker 镜像 **25 个 / 110.7 GB**。

## 第三个自然源码失败：NodeBB-8168

| 项目 | 结果 |
|---|---|
| 模型补丁 | 22,876 B，4 个源码文件 |
| 官方 | failed，310/311 |
| 缺失测试 | `user.uploadCroppedPicture should remove uploaded picture` |
| reviewer | 1 finding |
| verified | **1/1** |
| 正确补丁 | **0 verified** |

reviewer 定位到 `deleteProfileImages` 的扩展名处理；control-only probe 选中 gold 中的 `await deletePicture(uid, 'uploadedpicture')`。

repair A/B：

| Arm | 结果 | Patch |
|---|---|---:|
| reviewed | **failed** | 23,418 B |
| generic | **failed** | 22,876 B（未改） |

reviewed 有修改但仍有 1 个测试失败；generic 完全没改。

自然样本总表：

| 任务 | reviewer | verified | reviewed repair | generic |
|---|---|---|---:|---|
| ansible-c1f2 | 2 | 1/1 | pass 6/6 | fail |
| openlibrary-0dc5b | 2 | 2/2 | pass 65/61 | fail |
| NodeBB-8168 | 1 | 1/1 | fail | fail |

当前：reviewer task-level **3/3**，verified **4/5**，reviewed repair **2/3**，generic **0/3**。

## NodeBB repair 显式文件 hint

对比 reviewed 补丁与 gold：reviewed 已有 `uploadedpicture` 清理，但缺少 gold 的 `src/user/delete.js` 修改。

加 `REPAIR_HINT=src/user/delete.js` 后重跑 reviewed：

| Arm | 结果 | Patch |
|---|---|---:|
| reviewed + hint | **failed** | 22,876 B（未修改） |
| reviewed（无 hint） | failed | 23,418 B |

显式文件目标也没有诱导编辑；NodeBB 的修复仍未落地。

自然样本 repair 维持 **2/3**。限制：repair prompt 即使给出文件名，模型也可能只思考不编辑；需要更强制的编辑协议或更小的上下文。

## 强制编辑协议

给 repair 增加第二轮：若指定的 `REPAIR_HINT` 文件仍未出现在补丁中，追加：

> Do not analyze further. Your next action must be an Edit on `<target>`.

NodeBB 结果：

| Run | Patch | 第二轮 | 官方 |
|---|---:|---|---|
| hint only | 22,876 B | 否 | failed |
| **hint + 强制编辑** | **23,418 B** | **是** | **failed** |

强制协议成功让模型发起编辑，把“完全不改”变成“改了但没修对”。这说明：

- 编辑合规问题可以靠协议解决；
- 修复正确性仍是独立问题；
- 下一层瓶颈是 reviewed 补丁缺少 `src/user/delete.js` 或对应清理逻辑。

自然 repair 仍为 **2/3**。

## NodeBB 失败 assertion

手动应用 reviewed 补丁 + 官方测试后，真实失败：

```text
test/user.js:1248
AssertionError: Expected "actual" to be strictly unequal to: false
const avatarPath = await User.getLocalAvatarPath(uid);
assert.notStrictEqual(avatarPath, false);
```

即 `User.getLocalAvatarPath(uid)` 返回 `false`，测试无法继续清理 uploaded picture。

gold 的实现是：

```js
User.getLocalAvatarPath = async function (uid) {
    return getPicturePath(uid, 'uploadedpicture');
};
```

reviewed 补丁仍走 `getLocalImagePath`，没有使用 gold 的直接路径解析，所以即使第二轮编辑了 `src/user/delete.js`，这个断言仍失败。

这进一步说明：强制编辑解决了“没改”，但 reviewed 的定位仍不完整；需要把真实 assertion 与 gold 行一起作为 edit plan。

## NodeBB plan-guided repair

手动给出一条明确 finding：

- location: `src/user/picture.js:getLocalAvatarPath`
- current: `getLocalImagePath(...)`
- required: `return getPicturePath(uid, 'uploadedpicture');`
- check/expectedFailure: 真实 `test/user.js:1248` assertion

加 `REPAIR_HINT=src/user/picture.js` 后：

| 指标 | 结果 |
|---|---|
| reviewed repair | **passed 311/311** |
| Patch | 24,432 B |
| 第二轮强制编辑 | 是 |
| 耗时 | 246s |

这是 plan-guided 的上限：只要给出正确的 current/required 和 assertion，模型能在 NodeBB 上修好；但这条 finding 是人工从 gold/测试构造的，不是 reviewer 自主产生。

自然样本修复：

| 设置 | reviewed fail→pass |
|---|---:|
| reviewer finding + 失败摘要 | **2/3** |
| 加人工 gold edit plan | **3/3** |

## NodeBB reviewer 仍不能自动产出 edit plan

给真实 assertion 后：

- 2 findings；
- 两条都在 `getAllowedProfileImageExtensions` / 硬编码扩展名；
- 不是失败的 `getLocalAvatarPath` 根因。

再把“从 `User.getLocalAvatarPath` 开始，不要提扩展名列表”写入失败摘要：

- reviewer 变成 **0 findings**；
- 说明 prompt 过度约束会压制 finding，而不是提高定位。

结论：

> 对 NodeBB，reviewer 目前不能稳定从 assertion 生成 exact edit plan；人工 gold plan 能 pass，但这只是上限。

需要一个确定性的 failure→plan 编译器：从 assertion 提取函数名，在 candidate/control 同函数中找 control-only 行，生成 current/required，而不是继续调 reviewer prompt。

## 确定性 failure→plan 编译器

实现：从失败 assertion 提取函数名（`getLocalAvatarPath`），在 candidate/control 中抽取该函数的**完整函数体**，生成 current/required。

第一版只选 control-only 单行，repair 仍 failed（23,899 B）。

改成函数体级后：

| 指标 | 结果 |
|---|---|
| reviewed repair | **passed 311/311** |
| Patch | 23,181 B |
| 第二轮强制编辑 | 是 |
| 耗时 | 246s |

这说明修复失败不是模型能力问题，而是 **plan 粒度** 问题：

- 单行 diff 不足以指导；
- 完整 current/required 函数体可以。

限制：

- 编译器使用了 gold/control 来提取 required；
- 这不是产品可用的 reviewer 自主 plan；
- 但证明 exact plan 能让 NodeBB fail→pass。

自然 repair 汇总：

| 设置 | reviewed fail→pass |
|---|---:|
| reviewer finding + 失败摘要 | 2/3 |
| 函数体级 control-guided plan | **3/3** |

## Reviewer plan 模式与 control-free plan

尝试让 reviewer 直接输出函数体级 plan：

- 加 `REVIEWER_PLAN=1` + assertion；
- 结果 **0 findings**。

改为 control-free plan：

- 给 candidate 的 `getLocalAvatarPath` 函数体；
- 给真实 assertion；
- required 只写自然语言目标，不给 gold 代码。

reviewed repair：

| 设置 | 结果 | Patch |
|---|---|---:|
| control-free plan | **failed** | 25,300 B |
| control-guided 函数体 plan | **passed 311/311** | 23,181 B |

结论：

- 模型能编辑，但不能从 assertion 推断出 `getPicturePath` 这种 exact required；
- 只有给出 gold 函数体，NodeBB 才稳定通过；
- 当前 reviewer 还不能替代 control-guided plan。

这是本轮的重要负结果：自然样本的 plan-guided 3/3 依赖 gold/control，不是纯 reviewer 能力。

## 正确补丁 + 失败摘要的误报测试

给 reviewer 正确补丁（gold/control）再附上真实失败摘要：

| 任务 | reviewer findings | gate verified | refuted | invalid |
|---|---:|---:|---:|---:|
| NodeBB-8168 | 2 | **0** | 0 | 1 |
| openlibrary-0dc5b | 1 | **0** | 1 | 0 |

结论：

- reviewer 在正确补丁上仍会因失败摘要产生误报（共 3 条）；
- verified gate 全部拦截：**0 verified 误报**；
- NodeBB 有 1 个 invalid-control，而不是 refuted，仍需改进；
- 这验证了“reviewer 只提议，gate 决定是否可信”的分层是必要的。

自然样本指标补充：

| 指标 | 结果 |
|---|---:|
| 正确补丁 reviewer 误报 | 3 |
| 被 gate 拦截 | 3/3 |
| verified 误报 | **0** |
| invalid-control | 1 |

## 同补丁 probe：invalid → refuted

当 candidate 与 control 是同一补丁，且 probe 两边都失败时，原逻辑记为 invalid-control。现在改为 `refuted-identical-patch`：

- 正确补丁上本来就不应存在 candidate/control 差异；
- 同补丁 probe 失败不能算环境 invalid。

NodeBB 正确补丁复测：

| 指标 | 结果 |
|---|---:|
| findings | 2 |
| verified | **0** |
| refuted | 1 |
| invalid | **0** |

正确补丁误报测试现在：3 条 reviewer findings，gate 0 verified、3 blocked、0 invalid。

## 第五个 ansible hard51：verifier 卡住

`ansible-d72025` facts 臂完成 agent 后，官方 verifier 运行超过 7 分钟仍未产出结果，手动终止并删除该任务镜像。

没有新增样本；自然源码失败仍为 3 个。

这也说明 hard51 的另一类限制：不是模型不修，而是官方 verifier 对部分任务过慢，必须设置 per-task timeout 或改用已有失败样本分析。

## 第四个 openlibrary hard51：0 补丁超时

`openlibrary-322d7a` facts 臂 10 分钟超时，模型补丁 0 字节，官方 failed。没有源码改动，不能用于 reviewer 分析；已删除该任务镜像。

第 4 个自然源码失败仍未找到。下一步不再随机抽 hard51，而是优先自动提取 assertion / 从已有失败补丁扩展。

## 自动失败摘要提取器

新增 `eval/swe-pro/failure-excerpt.mjs`：

- 读取 verifier 的 `output.json` + `run-script-stdout.txt`；
- 提取 failed tests；
- 对 pytest 保留 assertion 块，过滤 RERUN/PASSED 进度行；
- 对 mocha JSON 提取 `err.message`/`err.stack`。

openlibrary 自动摘要接入 reviewer：

- 自动产出 1 条 finding，位置 `name_from_list`；
- gate **1/1 verified**；
- 但 verified 行是 `STRIP_CHARS` 注释，不是 `strip_foc` 根因。

结论：

- 自动提取失败测试与 assertion 已可用；
- reviewer 能定位到正确函数；
- control-only probe 仍可能选中非根因行，precision 不足。

后续需要在 control-only probe 中优先选择与 assertion 文本/函数语义一致的行，而不是第一条/最高 token 匹配行。

## 自动摘要第二轮：comment-only 过滤

patchDiffProbe 同步过滤：

- 跳过注释差异（`#` / `//`）；
- 按 finding 文本给 control-only 行打分；
- location 支持 `path:symbol`。

openlibrary 自动摘要复测：

- reviewer 1 条 finding；
- gate 1/1 verified；
- 选中行从 `STRIP_CHARS` 注释变成 `name_from_list(...)` 调用点；
- 仍不是 `strip_foc` 根因。

结论：自动摘要与注释过滤已经可用，但“选中差异行 ≠ 根因行”仍是 precision 问题。

下一步应要求 control-only 行与 assertion 中的实际值/变量名匹配，而不是只按 finding 文本打分。

## 第五个 openlibrary hard51：再次 0 补丁超时

`openlibrary-53d376` facts 臂 10 分钟超时，补丁 0 字节。没有源码改动，不能用于 reviewer/repair；已删除镜像。

连续两个 openlibrary hard51 都出现 0 补丁超时，说明随机抽 hard51 的失败样本产出率很低。后续优先：
- 复用已有失败补丁；
- 或给 agent 更长预算后再筛选。

## 自动摘要根因行修复

问题：control-only 行按 finding JSON 全量 token 打分，选中调用点/无关行。

改为：

- 从 `finding.current` 提取代码 token；
- 当前行 token 权重 ×3；
- 不再用行号（hunk 偏移会误导）。

openlibrary 自动摘要复测：

| 指标 | 结果 |
|---|---:|
| control 行 | `name = ' '.join(strip_foc(s).strip(STRIP_CHARS) ...)` |
| verified | **1/1** |
| 正确补丁 | **0 verified，1 refuted** |
| invalid | 0 |

现在自动摘要能命中 `strip_foc` 根因行，而不是调用点或注释。限制：reviewer 输出的 `required` 仍是 candidate 风格，repair 需要额外的 probe→plan 转换。

## Probe → Plan → Repair

从 openlibrary 自动 verified probe 中提取：

- candidate 行：`return remove_trailing_dot(' '.join(s.strip(STRIP_CHARS) ...))`
- control 根因行：`name = ' '.join(strip_foc(s).strip(STRIP_CHARS) ...)`
- assertion：expected 不含 `[from old catalog`，actual 含。

生成 finding 后跑 reviewed repair：

| 指标 | 结果 |
|---|---|
| repair | **passed 65/61** |
| Patch | 3,695 B |
| 耗时 | 214s |
| 强制第二轮 | 否 |

这完成了自动链路：

> 自动失败摘要 → reviewer → verified probe 选根因行 → probe-derived plan → repair fail→pass

限制：control 根因行仍来自 gold/control 对照，不是纯 reviewer 猜测；但它不再是人工手选的。

自然 repair：

| 设置 | reviewed fail→pass |
|---|---:|
| reviewer finding + 人工失败摘要 | 2/3 |
| probe-derived plan | **3/3** |

## 20 分钟预算仍 0 补丁

`openlibrary-322d7a` 用 20 分钟 agent 预算重跑，仍然补丁 0 字节。说明该任务不是预算不足，而是模型完全没有落地编辑。

结论：不应继续对这类任务加预算；应优先选择模型会编辑的任务。已删除镜像。

## 第六个 ansible hard51：编辑过滤 + 通过

`ansible-de5858` 用 20 分钟预算：

- 第 6 分钟仍无编辑；
- 第 9 分钟出现 3 个源码修改；
- 第 19 分钟仍在编辑；
- 最终官方 **passed**，patch 13,623 B。

结论：中途检查 `git status` 能区分“完全不编辑”和“在编辑”的任务，但“会编辑”不等于“会失败”。

已删除该任务镜像；自然源码失败仍为 3 个。

## 第七个 hard51：qutebrowser 编辑后通过

`qutebrowser-3e21c821`：

- 第 9 分钟出现源码编辑；
- 第 15 分钟仍有编辑；
- 最终官方 **passed**，patch 18,229 B。

再次说明：hard51 中“模型会编辑”通常也会通过；自然失败不能靠随机抽 hard51 稳定获得。

已删除镜像，自然源码失败仍为 3 个。

## 自动 probe→plan 工具

新增 `eval/swe-pro/probe-plan.mjs`：

- 读取 verified probe results；
- 解析 `grep -Fq` 的 current/required/file；
- 生成 finding JSON。

NodeBB 自动 probe-plan 复测：

| 指标 | 结果 |
|---|---|
| repair | **failed** |
| Patch | 23,880 B |
| 第二轮 | 是 |
| 官方 | 0/311 |

原因：probe 只给出单行 `await deletePicture(uid, 'uploadedpicture')`，而 NodeBB 需要函数体级 plan（`getLocalAvatarPath` / `getPicturePath`）。

结论：probe→plan 工具可用于单行修复，但 NodeBB 需要函数体扩展。

## Probe-plan 函数体扩展失败

给 `probe-plan.mjs` 加函数体提取后：

- NodeBB：选中的 required 属于 `removeProfileImage`，不是根因 `getLocalAvatarPath`；
- openlibrary：函数体 plan repair **failed**，补丁 3,667 B 未修改。

结论：

> probe 的 control-only 行只能证明“候选缺少这一行”，不能证明它属于失败根因；函数体扩展也无法修正这个语义错位。

单行/函数体 probe-plan 仍不是可靠的 exact plan 生成器。自然样本保持 3 个。

## teleport hard51：model/patch 错误

`teleport-65438e6e` 两次 job 都是 `agent-or-model-error`，没有有效 patch。无法用于失败分析；已删除镜像。

自然源码失败仍为 3 个。

## 第八个 hard51：openlibrary-630221 编辑后通过

- 第 9 分钟出现 5 个源码修改；
- 最终官方 **passed**，patch 25,864 B。

hard51 抽样继续呈现同一模式：模型编辑后通常通过；自然失败仍只有 3 个。已删除镜像。

## 自动 symbolic probe-plan：NodeBB pass

从失败摘要提取函数名：

```text
User.getLocalAvatarPath(...)
```

`probe-plan.mjs` 现在会：

1. 从 assertion 提取 `getLocalAvatarPath`；
2. 在 control/candidate 中抽取该函数的完整函数体；
3. 生成 current/required plan。

NodeBB reviewed repair：

| 指标 | 结果 |
|---|---|
| repair | **passed 311/311** |
| Patch | 23,572 B |
| 第二轮 | 是 |
| 耗时 | 247s |

自然样本自动链：

- ansible-c1f2：reviewer finding → pass 6/6；
- openlibrary-0dc5b：自动摘要 → probe → probe-plan → pass 65/61；
- NodeBB-8168：自动摘要 → symbolic probe-plan → pass 311/311。

plan-guided fail→pass 现在 **3/3**，但 required 仍来自 control/gold，不是纯 reviewer 猜测。

## flipt-2ca5：官方准备阶段再次超时

20 分钟预算下，flipt hard 仍卡在 readiness/官方测试准备阶段，7 分钟以上未进入 agent，未产出补丁。停止并删除镜像。

flipt 类任务不适合作为快速自然失败抽样来源。

## webclients hard 与自动摘要局限

- `webclients-08bb` 两次 job 都是 `agent-or-model-error`，没有 patch；已删除镜像。
- 用自动摘要重跑 ansible：reviewer **0 findings**。

原因：ansible 的失败栈只有 `URLError`，真正关键的是测试 mock：

```python
mm.get_manager = Mock(return_value=gm)
```

自动摘要没有包含测试 setup，所以 reviewer 无法推断 `ModuleManager` 应委托 `get_manager`。

结论：自动摘要需要“失败 assertion + 测试 setup 片段”，仅有 traceback 不足以覆盖 mock 型失败。
