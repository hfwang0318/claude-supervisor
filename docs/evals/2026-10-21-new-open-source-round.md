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
