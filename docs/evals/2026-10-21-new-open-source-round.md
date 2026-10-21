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
