# SWE-bench Pro V2 项目固定子集 v1 — 2026-10-13

**已选定并冻结来源清单：30个真实仓库任务、11个仓库。** 当前完成的是选型、抽取与元数据完整性核验；容器中的空patch/参考patch验收、真实模型运行和旧runner接入尚未执行。

主清单：[subset-v1.json](../../eval/data/swe-pro-v2/subset-v1.json)。大镜像、完整源仓库、gold patch和隐藏测试均不进入本项目源码目录。清单不会被现有四任务assist runner自动加载。

## 来源与完整性

- 基准：SWE-bench Pro V2 `2.0.0`，[官方仓库](https://github.com/scaleapi/SWE-bench_Pro-os)。
- 源commit：`66f92766bba642462d4bbe5479e83f91f9211862`。
- 数据卡：`ScaleAI/SWE-bench_Pro` / default / test；读取时revision `2d52cb3df914a3fcf80c7f66738b3a88ae37fc50`。
- 清单SHA-256：`1d3260043ef0589d44483bc46243e4331233bb13b2952cf71e92cb228eb0d628`，同时记录在 `eval/data/swe-pro-v2/SHA256SUMS`。
- 从642项按仓库及普通/HARD-51分层，用固定seed20261013整理82项候选，再按需求内容和目标覆盖选择30项；没有使用目标模型或A/B胜负结果挑选。
- 候选的instruction、task.toml、verifier配置均核对官方SHA256SUMS；参考/测试patch hash与数据卡对应，共82项一致。
- 所选30项的公开OCI manifest/config digest全部核验，架构均为linux/amd64。没有拉镜像层或启动容器，registry可访问不等于实际验收可跑。
- 清单保留原始repo/base_commit、原需求hash、所有任务文件hash、镜像平台digest及F2P/P2P数量。各模型实际输入仍是原始instruction及干净repo，gold/verifier在评价侧。

## 构成

20项开发回归，10项保留评估；开发集合中的6项固定为快速检查；普通20项、HARD-51共10项。开发集为13普通/7 hard，保留集为7普通/3 hard。

上游语言标签：JS12、Python9、Go8、TS1。Element Web和Proton Webclients属于混合JS/TS代码库，但本数据卡将这些任务标为js；清单保留原标签，不改造出虚假的语言分布。

split依据问题主题和组件差异设置，仓库会重叠；不声称仓库独立泛化。后续接入时还应核验相近问题/相同组件的泄漏风险。9项原始P2P为空，其通过仅覆盖原始修复验收，不证明全面回归覆盖。

| # | 仓库 | 用例内容 | split | 原hard标签 | F2P/P2P | 快速检查 |
|---|---|---|---|---|---:|---|
| 1 | NodeBB/NodeBB | [上传错误响应不一致](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-8ca65b0c78c67c1653487c02d1135e1b702185e1-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e/instruction.md) | development | ordinary | 1/32 | 是 |
| 2 | NodeBB/NodeBB | [并发请求重复创建主题](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-1ea9481af6125ffd6da0592ed439aa62af0bca11-vd59a5728dfc977f44533186ace531248c2917516/instruction.md) | development | ordinary | 3/252 |  |
| 3 | NodeBB/NodeBB | [实例账号 WebFinger 响应](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-da0211b1a001d45d73b4c84c6417a4f1b0312575-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e/instruction.md) | holdout | ordinary | 2/23 |  |
| 4 | NodeBB/NodeBB | [API token 内部工具缺失](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-7b8bffd763e2155cf88f3ebc258fa68ebe18188d-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e/instruction.md) | development | ordinary | 12/0 |  |
| 5 | NodeBB/NodeBB | [移除图片后磁盘文件未清理](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_NodeBB__NodeBB-8168c6c40707478f71b8af60300830fe554c778c-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e/instruction.md) | development | hard | 4/307 |  |
| 6 | ansible/ansible | [原子移动后的文件权限](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_ansible__ansible-5260527c4a71bfed99d803e687dd19619423b134-vba6da65a0f3baefda7a058ebbd0a8dcafb8512f5/instruction.md) | holdout | ordinary | 3/8 |  |
| 7 | ansible/ansible | [循环与委托重复计算](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_ansible__ansible-42355d181a11b51ebfc56f6f4b3d9c74e01cb13b-v1055803c3a812189a1133297f7f5468579283f86/instruction.md) | development | ordinary | 19/1 |  |
| 8 | ansible/ansible | [插件加载来源未报告](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_ansible__ansible-984216f52e76b904e5b0fa0fb956ab4f1e0a7751-v1055803c3a812189a1133297f7f5468579283f86/instruction.md) | development | ordinary | 1/15 | 是 |
| 9 | ansible/ansible | [无效容量字符串未拒绝](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_ansible__ansible-d62496fe416623e88b90139dc7917080cb04ce70-v0f01c69f1e2528b935359cfe578530722bca2c59/instruction.md) | development | hard | 22/92 |  |
| 10 | element-hq/element-web | [窗口宽度状态接口](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_element-hq__element-web-72a8f8f03b1a01bb70ef8a5bb61759416991b32c-vnan/instruction.md) | development | ordinary | 2/217 |  |
| 11 | element-hq/element-web | [设备会话重命名](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_element-hq__element-web-4fec436883b601a3cac2d4a58067e597f737b817-vnan/instruction.md) | holdout | ordinary | 13/35 |  |
| 12 | element-hq/element-web | [IndexedDB 意外关闭](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_element-hq__element-web-404c412bcb694f04ba0c4d5479541203d701bca0-vnan/instruction.md) | development | ordinary | 6/62 | 是 |
| 13 | element-hq/element-web | [跨连续消息搜索结果合并](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_element-hq__element-web-ecfd1736e5dd9808e87911fc264e6c816653e1a9-vnan/instruction.md) | development | hard | 9/17 |  |
| 14 | flipt-io/flipt | [配置校验缺少文件位置](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_flipt-io__flipt-f36bd61fb1cee4669de1f00e59da462bfeae8765/instruction.md) | development | ordinary | 2/0 | 是 |
| 15 | flipt-io/flipt | [CUE 校验 YAML 配置](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_flipt-io__flipt-c1728053367c753688f114ec26e703c8fdeda125/instruction.md) | development | hard | 2/0 |  |
| 16 | future-architect/vuls | [漏洞模型 KEV 字段](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_future-architect__vuls-e049df50fa1eecdccc5348e27845b5c783ed7c76-v73dc95f6b90883d8a87e01e5e9bb6d3cc32add6d/instruction.md) | development | ordinary | 2/0 |  |
| 17 | future-architect/vuls | [Amazon Linux 2 扩展仓库](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_future-architect__vuls-ca3f6b1dbf2cd24d1537bfda43e788443ce03a0c/instruction.md) | development | hard | 16/64 |  |
| 18 | gravitational/teleport | [禁止删除唯一必需的 MFA 设备](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_gravitational__teleport-3ff75e29fb2153a2637fe7f83e49dc04b1c99c9f/instruction.md) | holdout | ordinary | 1/1 |  |
| 19 | gravitational/teleport | [助手 token 用量计数](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_gravitational__teleport-2b15263e49da5625922581569834eec4838a9257-vee9b09fb20c43af7e520f57e9239bbcf46b7113d/instruction.md) | development | hard | 14/0 |  |
| 20 | internetarchive/openlibrary | [规范化未移除占位值](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_internetarchive__openlibrary-fdbc0d8f418333c7e575c40b661b582c301ef7ac-v13642507b4fc1f8d234172bf8129942da2c2ca26/instruction.md) | development | ordinary | 1/37 | 是 |
| 21 | internetarchive/openlibrary | [导入元数据有效性](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_internetarchive__openlibrary-f3b26c2c0721f8713353fe4b341230332e30008d-v0f5aece3601a5b4419f7ccec1dbda2071be28ee4/instruction.md) | development | ordinary | 8/44 |  |
| 22 | internetarchive/openlibrary | [MARC 880 字段抽取](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_internetarchive__openlibrary-b67138b316b1e9c11df8a4a8391fe5cc8e75ff9f-ve8c8d62a2b60610a3c4631f5f23ed866bada9818/instruction.md) | holdout | hard | 11/53 |  |
| 23 | navidrome/navidrome | [用户属性操作的上下文依赖](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_navidrome__navidrome-ee21f3957e0de91624427e93c62b8ee390de72e3/instruction.md) | holdout | ordinary | 15/0 |  |
| 24 | navidrome/navidrome | [修改密码前校验当前密码](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_navidrome__navidrome-874b17b8f614056df0ef021b5d4f977341084185/instruction.md) | holdout | hard | 1/0 |  |
| 25 | protonmail/webclients | [设备名称的根链接查询](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_protonmail__webclients-cba6ebbd0707caa524ffee51c62b197f6122c902/instruction.md) | holdout | ordinary | 1/2 |  |
| 26 | protonmail/webclients | [图片代理中的远程图片](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_protonmail__webclients-1917e37f5d9941a3459ce4b0177e201e2d94a622/instruction.md) | development | ordinary | 3/1 |  |
| 27 | protonmail/webclients | [邮箱列表刷新与过期状态](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_protonmail__webclients-e65cc5f33719e02e1c378146fb981d27bc24bdf4/instruction.md) | development | hard | 3/0 |  |
| 28 | qutebrowser/qutebrowser | [空命令输入错误](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_qutebrowser__qutebrowser-a84ecfb80a00f8ab7e341372560458e3f9cfffa2-v2ef375ac784985212b1805e1d0431dc8f1b3c171/instruction.md) | development | ordinary | 3/28 | 是 |
| 29 | qutebrowser/qutebrowser | [进程成功输出的生命周期](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_qutebrowser__qutebrowser-c09e1439f145c66ee3af574386e277dd2388d094-v2ef375ac784985212b1805e1d0431dc8f1b3c171/instruction.md) | holdout | hard | 5/100 |  |
| 30 | tutao/tutanota | [跨类熵管理耦合](https://raw.githubusercontent.com/scaleapi/SWE-bench_Pro-os/66f92766bba642462d4bbe5479e83f91f9211862/v2/tasks/instance_tutao__tutanota-f3ffe17af6e8ab007e8d461355057ad237846d9d-vbc0d9ba8f0071fbe982809910959a6ff8884dbbf/instruction.md) | holdout | ordinary | 3/0 |  |

## 执行前必须补齐的验证

在真正的容器worker上，对每项运行空patch和官方参考patch：目标F2P应该先失败后通过，要求的P2P应保持通过；环境故障、依赖失败和flaky单独记录。最终模型patch在干净环境重放原始verifier，不能把主模型修改过的测试当作最终验收。

Pro V2原协议agent/verifier上限均为3000秒。可另设内部快速回归预算，但必须冻结并标注，不能把内部子集或缩短预算的结果称为官方总榜成绩。模型主阶段禁止取外网答案和修复后的git历史，模型服务连接单独放行。

当前本机为arm64，Docker CLI有安装但daemon未连通；所选镜像是linux/amd64。还需确定可用的Linux容器worker，或明确本机模拟运行的资源与时间限制。没有部署远程资源、安装依赖或进行付费模型调用。

用户指定主/审查模型glm-5.2，当前实际路由仍不匹配，详见[路由验证](../evals/2026-10-13-glm-5.2-retest.md)。新数据集不改变模型选择；正式运行前须确认实际响应模型与请求相符。

任务文本、代码patch及测试适用原始仓库许可；只有benchmark harness/tooling标MIT。这里提交清单、hash和来源引用，不复制完整任务源代码或解答，也不将其许可改写为本项目MIT。

## 下一步交付

以这份来源冻结清单作为容器/评分适配的输入。先完成6个快速检查任务的空patch/参考patch验证，再扩至30项；确认环境可用后接入本项目的Claude Code插件对照。运行数据、补丁和usage放在忽略的eval/results中。当前来源冻结完成，不宣称评测器接入或模型结果完成。
