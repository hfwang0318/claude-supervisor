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
