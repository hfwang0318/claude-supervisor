# Local Docker SWE-bench Pro V2 / GLM-5.3 comparison

Status: requested execution finished at2026-10-14T01:57:31.543Z; original60/60 attempts and10 separate compatibility attempts have final receipts. Functional passed/failed/unknown outcomes are reported below.

User authorization: establish local Docker environments and run one comparison round with GLM-5.3. Scope is the frozen 30-task project subset, existing versus facts, one repetition per arm (60 planned attempts). This is not the official full 642-task benchmark score.

## Frozen protocol

- Subset SHA-256: `1d3260043ef0589d44483bc46243e4331233bb13b2952cf71e92cb228eb0d628`.
- Official source: `scaleapi/SWE-bench_Pro-os` at `66f92766bba642462d4bbe5479e83f91f9211862`; all 300 task files match locked hashes.
- Runtime: Docker Desktop 29.7.2 on ARM64 Mac, Linux/amd64 images by digest, 1 CPU/4096 MiB per task, two concurrent slots. Docker VM memory was increased from5120 to9216MiB through Docker's own backend settings interface; actual engine memory9361784832bytes (~8.7GiB) verified. The Mac remained locked; no unlock or security-setting change was needed. Emulation is part of this local measurement environment.
- Claude Code 2.1.295 native Linux binary SHA-256 `4503bfe11a6c7fcc1e0b39b5e0d347c04248f750b03b0977b3ad6b531fe6f358`; Node22.23.3.
- Worker/side: `zhipu/glm-5.3[1m]`, default reasoning. SDK strips the context marker for API requests; actual provider response `glm-5.3` was verified. No stronger alias fallback permitted.
- Execution mode off; existing/facts differ only in assistance mode. Read-only source assistance retains its bounds and evidence checks. Probe/recovery are not activated.
- Deterministic shuffled schedule seed53, 50-minute agent/verifier limits, no automatic paid task retries.
- Agent receives original instruction and clean repository, isolated config, no MCP/web tools/personal plugins, no hidden verifier/gold files, no Docker socket. Only model gateway egress.
- Agent patch captured against immutable base commit, including changes committed by the worker. Entire worker container destroyed before strict patch replay in a new pinned scoring container. Official verifier unchanged.
- Environment readiness requires empty raw reward0 plus reference reward1 and parsed target-test evidence for the positive control. Parsed compile/import/hook failures are valid negatives once the reference passes; live failures before test execution are marked separately. Missing/malformed parser output and unvalidated dependencies never certify success.

## Setup evidence and repairs

Initial six-case environment pass verified NodeBB, Ansible, Element Web, OpenLibrary and Qutebrowser. Flipt initially failed because our `bash -lc` invocation reset the image's Go PATH. The image has Go1.24.3 in `/usr/local/go/bin`; `bash -c` preserves it. Both agent and grader now preserve image PATH, with only `/opt/eval` prepended for agent tools. Official source/test artifacts were not edited. Corrected full-set validation is recorded separately from the initial diagnostic pass.

The internal Docker network probe reached gateway health successfully, while direct public IP and host service access were blocked. One direct 64-output-token model identity preflight returned GLM-5.3. Three CLI setup probes were rejected locally before any upstream model request while resolving the SDK's context-marker normalization. The fourth full CLI probe returned OK in about9.4s: observed3300 input,37 output,768 cached tokens. Two subsequent parallel CLI probes also completed with actual GLM-5.3 identity, in8.9s/9.6s, on independent networks and containers. These four successful setup API calls are separate from benchmark attempts. Native CLI costBasis was unknown, so its dollar estimate is not used.

A free50ms runtime timeout probe killed the worker's descendants, recovered the partial patch and removed the container. A fresh-context review found committed-patch capture, infrastructure-score classification and incomplete-usage accounting issues. They were fixed with observed RED/GREEN regressions. `node scripts/check.mjs` passed144 host tests, existing scorer checks and four new SWE Pro self-test groups. These checks establish mechanism behavior, not model quality.

## Final results and accounting

All30 selected image downloads completed. Original scheduled attempts:60/60. Separate compatibility attempts:10/10. The effective comparison contains one selected outcome per task/mode (60 rows), replacing only confirmed original zero-request libc startup failures. Original results remain available and are not rewritten. No model-quality failure or timeout was retried.

### Original frozen cohort

| Mode | Passed | Failed | Unknown | Agent median min | Agent P90 min | Agent timeouts | Model requests | Unknown side calls | Facts returned |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| existing | 23 | 2 | 5 | 12.7 | 28.4 | 2 | 2059 | 29/44 | 0 |
| facts | 23 | 2 | 5 | 11.7 | 31.9 | 1 | 1989 | 6/16 | 0 |

Complete task pairs: 30/30. Pairs with independent Boolean outcomes in both modes: 25. Both passed: 21; facts only: 2; existing only: 2; both failed: 0. Other pairs retain unknown outcomes.

### Effective comparison with explicit compatibility supplement

| Mode | Passed | Failed | Unknown | Agent median min | Agent P90 min | Agent timeouts | Model requests | Unknown side calls | Facts returned |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| existing | 27 | 3 | 0 | 15.5 | 38.7 | 3 | 2530 | 31/51 | 0 |
| facts | 27 | 3 | 0 | 14.1 | 34.4 | 3 | 2410 | 7/19 | 0 |

Complete task pairs: 30/30. Pairs with independent Boolean outcomes in both modes: 30. Both passed: 25; facts only: 2; existing only: 2; both failed: 1. Other pairs retain unknown outcomes.

The effective table combines the original runtime and a separately recorded compatibility runtime. Both use the exact same native CLI2.1.295/Node22.23.3 bytes, model identities, frozen plugins, task images and official graders; affected tasks use a scoped GNU tool loader. This is a declared mixed runtime cohort, not a claim that every original attempt used identical runtime packaging.

Actual total dollar cost and cost per success remain unknown. Complete task usage records: existing8/30, facts21/30. Gateway-observed usage is a lower bound, not reconciled provider billing.

| Mode | Observed input lower bound | Observed output lower bound | Observed cached input lower bound |
|---|---:|---:|---:|
| existing | 3272608 | 1117212 | 117384832 |
| facts | 3398834 | 1046779 | 113639872 |

Returned facts are delivery-log counts; they do not prove that the main model consumed a fact or changed its action. Side calls marked unknown retain timeout/failed-output uncertainty. One repetition on a30-task selected subset cannot establish statistically reliable superiority or the official642-task benchmark score.

Independent final scope audit rechecked 54 successful effective outcomes against original readiness controls, patch hashes, pinned image identity and every official required test name. Positive grading uses fresh containers and unchanged official verifiers.

### Per-task results

| Task | Repository | Split | Original existing | Original facts | Effective existing | Effective facts |
|---|---|---|---|---|---|---|
| instance_NodeBB__NodeBB-8ca65b0c78c67c1653487c02d1135e1b702185e1-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e | NodeBB/NodeBB | development | passed | passed | passed | passed |
| instance_NodeBB__NodeBB-1ea9481af6125ffd6da0592ed439aa62af0bca11-vd59a5728dfc977f44533186ace531248c2917516 | NodeBB/NodeBB | development | passed | passed | passed | passed |
| instance_NodeBB__NodeBB-da0211b1a001d45d73b4c84c6417a4f1b0312575-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e | NodeBB/NodeBB | holdout | passed | passed | passed | passed |
| instance_NodeBB__NodeBB-7b8bffd763e2155cf88f3ebc258fa68ebe18188d-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e | NodeBB/NodeBB | development | passed | passed | passed | passed |
| instance_NodeBB__NodeBB-8168c6c40707478f71b8af60300830fe554c778c-vf2cf3cbd463b7ad942381f1c6d077626485a1e9e | NodeBB/NodeBB | development | passed | passed | passed | passed |
| instance_ansible__ansible-5260527c4a71bfed99d803e687dd19619423b134-vba6da65a0f3baefda7a058ebbd0a8dcafb8512f5 | ansible/ansible | holdout | passed | passed | passed | passed |
| instance_ansible__ansible-42355d181a11b51ebfc56f6f4b3d9c74e01cb13b-v1055803c3a812189a1133297f7f5468579283f86 | ansible/ansible | development | passed | passed | passed | passed |
| instance_ansible__ansible-984216f52e76b904e5b0fa0fb956ab4f1e0a7751-v1055803c3a812189a1133297f7f5468579283f86 | ansible/ansible | development | passed | passed | passed | passed |
| instance_ansible__ansible-d62496fe416623e88b90139dc7917080cb04ce70-v0f01c69f1e2528b935359cfe578530722bca2c59 | ansible/ansible | development | passed | passed | passed | passed |
| instance_element-hq__element-web-72a8f8f03b1a01bb70ef8a5bb61759416991b32c-vnan | element-hq/element-web | development | passed | passed | passed | passed |
| instance_element-hq__element-web-4fec436883b601a3cac2d4a58067e597f737b817-vnan | element-hq/element-web | holdout | passed | passed | passed | passed |
| instance_element-hq__element-web-404c412bcb694f04ba0c4d5479541203d701bca0-vnan | element-hq/element-web | development | passed | passed | passed | passed |
| instance_element-hq__element-web-ecfd1736e5dd9808e87911fc264e6c816653e1a9-vnan | element-hq/element-web | development | passed | passed | passed | passed |
| instance_flipt-io__flipt-f36bd61fb1cee4669de1f00e59da462bfeae8765 | flipt-io/flipt | development | passed | passed | passed | passed |
| instance_flipt-io__flipt-c1728053367c753688f114ec26e703c8fdeda125 | flipt-io/flipt | development | passed | failed | passed | failed |
| instance_future-architect__vuls-e049df50fa1eecdccc5348e27845b5c783ed7c76-v73dc95f6b90883d8a87e01e5e9bb6d3cc32add6d | future-architect/vuls | development | agent-or-model-error | agent-or-model-error | passed | passed |
| instance_future-architect__vuls-ca3f6b1dbf2cd24d1537bfda43e788443ce03a0c | future-architect/vuls | development | passed | passed | passed | passed |
| instance_gravitational__teleport-3ff75e29fb2153a2637fe7f83e49dc04b1c99c9f | gravitational/teleport | holdout | passed | passed | passed | passed |
| instance_gravitational__teleport-2b15263e49da5625922581569834eec4838a9257-vee9b09fb20c43af7e520f57e9239bbcf46b7113d | gravitational/teleport | development | agent-or-model-error | agent-or-model-error | passed | passed |
| instance_internetarchive__openlibrary-fdbc0d8f418333c7e575c40b661b582c301ef7ac-v13642507b4fc1f8d234172bf8129942da2c2ca26 | internetarchive/openlibrary | development | passed | passed | passed | passed |
| instance_internetarchive__openlibrary-f3b26c2c0721f8713353fe4b341230332e30008d-v0f5aece3601a5b4419f7ccec1dbda2071be28ee4 | internetarchive/openlibrary | development | passed | passed | passed | passed |
| instance_internetarchive__openlibrary-b67138b316b1e9c11df8a4a8391fe5cc8e75ff9f-ve8c8d62a2b60610a3c4631f5f23ed866bada9818 | internetarchive/openlibrary | holdout | failed | passed | failed | passed |
| instance_navidrome__navidrome-ee21f3957e0de91624427e93c62b8ee390de72e3 | navidrome/navidrome | holdout | passed | passed | passed | passed |
| instance_navidrome__navidrome-874b17b8f614056df0ef021b5d4f977341084185 | navidrome/navidrome | holdout | passed | passed | passed | passed |
| instance_protonmail__webclients-cba6ebbd0707caa524ffee51c62b197f6122c902 | protonmail/webclients | holdout | agent-or-model-error | agent-or-model-error | passed | passed |
| instance_protonmail__webclients-1917e37f5d9941a3459ce4b0177e201e2d94a622 | protonmail/webclients | development | agent-or-model-error | agent-or-model-error | passed | passed |
| instance_protonmail__webclients-e65cc5f33719e02e1c378146fb981d27bc24bdf4 | protonmail/webclients | development | agent-or-model-error | agent-or-model-error | failed | failed |
| instance_qutebrowser__qutebrowser-a84ecfb80a00f8ab7e341372560458e3f9cfffa2-v2ef375ac784985212b1805e1d0431dc8f1b3c171 | qutebrowser/qutebrowser | development | passed | passed | passed | passed |
| instance_qutebrowser__qutebrowser-c09e1439f145c66ee3af574386e277dd2388d094-v2ef375ac784985212b1805e1d0431dc8f1b3c171 | qutebrowser/qutebrowser | holdout | passed | failed | passed | failed |
| instance_tutao__tutanota-f3ffe17af6e8ab007e8d461355057ad237846d9d-vbc0d9ba8f0071fbe982809910959a6ff8884dbbf | tutao/tutanota | holdout | failed | passed | failed | passed |

JSON artifacts: `comparison/summary.json`, `comparison/summary-effective.json`, each original/supplemental `result.json`, `compatibility-supplement/experiment.json`, and source/download/runtime receipts. These generated artifacts remain ignored.

## Download routing evidence

Images come from the official `ghcr.io/scaleapi/swe-bench_pro-v2` repository using pinned digests. The 30-task manifest contains34.3GiB of unique compressed layers. Docker Desktop stores them in `/Users/hfwang/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`; its460GiB logical capacity is sparse, with about62GiB physically allocated at13:54UTC. This allocation includes all local Docker data, not only this experiment. Task sources and frozen runtime are in the worktree scratch directory described above.

Docker was already using the host system Clash proxy127.0.0.1:7897. On the same official layer, two16MiB probes through JMS node5 took5.26s/4.75s, versus11.01s through the previous system route. These small range samples do not establish sustained bulk throughput. A runtime-only override routes exactly `ghcr.io` and `pkg-containers.githubusercontent.com` through node5; other configuration and proxy selections were preserved. No Docker restart was required. After reconnecting two old CDN streams, both pending pulls completed at13:53:27/13:53:37UTC and advanced to official control checks. The override resets when Clash reloads its original configuration. The sanitized routing receipt is in scratch; no proxy credentials are stored with experiment artifacts.

## Continued full-round execution

At22:08 Asia/Shanghai on13October, the original two-slot run remained active with4/60 results independently passed. A separate serial image-only prefetch was started at21:58 to complete the fixed30-task cache without extra model calls; Docker coalesces concurrent pulls of the same digest. This download activity can overlap task execution and is recorded in scratch `prefetch.log`/`prefetch/downloads.json`. Agent/calibration/grading remain bounded to two slots. All300 source files, the manifest SHA256, adapter hash and both plugin hashes were reverified unchanged.

Initial completed facts runs had no returned SourceFact packets: their side-model call hit the plugin's30-second timeout. This is recorded as unknown supervision output rather than evidence of successful assistance. The frozen timeout remains unchanged for this round. Receipt-based aggregation in scratch writes `comparison/summary.json`, validates positive/negative controls for every success and rechecks all official required test names against fresh grading evidence.

## Completed cache and runtime compatibility supplement

The selected30 digest-pinned images finished downloading at22:21:56 Asia/Shanghai on13October. All30 references inspected successfully and all30 serial prefetch receipts report downloaded=true. The task sources remain300/300 hash verified. No image pruning was performed; about14GiB host disk space remained after the cache completed.

A free offline CLI/Node version check passed25/30 images and identified5 libc startup incompatibilities: one Vuls task, one Teleport task and all three ProtonMail tasks. Original attempts on affected images exit before any model request, with missing GNU ELF loader or unsupported musl relocation errors. The original cohort remains frozen and continues through all60 scheduled attempts. Quality failures, timeouts and attempts with actual model requests are not retried.

A separate runtime retains the exact original CLI2.1.295 and Node22.23.3 bytes and both plugin hashes, and invokes only these tool processes via the GNU loader/libraries from the already-pinned Node image. It sets a process-local library search path, without replacing task libraries or setting LD_LIBRARY_PATH for task commands. All5 affected images passed the offline plugin slash-command startup check with this runtime. Native binaries, wrappers, library tree and plugins are hash checked. The compatibility supplement waits for the original round to finish, then schedules only confirmed zero-request libc startup failures, at most2 model workers, preserving distinct experiment metadata and original receipts. It requires the same original empty/reference readiness and fresh official grading. This supplement changes tool runtime compatibility and will be reported explicitly as a mixed runtime result, alongside the original unadjusted cohort.

Supplement artifacts are under `eval/results/swe-pro-glm53/compatibility-supplement/`; the one-time continuation log and compatibility preflight receipts remain in scratch. No model version, supervision behavior, task selection or official tests were changed during the original experiment.

## Interpretation limits

Both modes run under the same local ARM64-to-amd64 emulation, one-CPU/four-GiB task limits,50-minute deadlines, restricted agent network and selected30-task scope. Agent tools prepend `/opt/eval` to PATH, so Node22.23.3 can shadow the project's image-provided Node when the agent invokes `node`; this can affect local agent diagnostics. Fresh scoring containers start from the original pinned images and do not mount the agent runtime. These conditions support comparison within this experiment and limit comparison with other harnesses or published full-benchmark scores. The compatibility supplement is declared separately, including its changed tool-loading mechanism.
