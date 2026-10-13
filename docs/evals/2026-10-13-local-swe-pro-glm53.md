# Local Docker SWE-bench Pro V2 / GLM-5.3 comparison

Status: environment validation in progress; no formal benchmark agent runs started yet.

User authorization: establish local Docker environments and run one comparison round with GLM-5.3. Scope is the frozen 30-task project subset, existing versus facts, one repetition per arm (60 planned attempts). This is not the official full 642-task benchmark score.

## Frozen protocol

- Subset SHA-256: `1d3260043ef0589d44483bc46243e4331233bb13b2952cf71e92cb228eb0d628`.
- Official source: `scaleapi/SWE-bench_Pro-os` at `66f92766bba642462d4bbe5479e83f91f9211862`; all 300 task files match locked hashes.
- Runtime: Docker Desktop 29.7.2 on ARM64 Mac, Linux/amd64 images by digest, 1 CPU/4096 MiB per task, one concurrent task. Docker VM memory 5120 MiB. Emulation is part of this local measurement environment.
- Claude Code 2.1.295 native Linux binary SHA-256 `4503bfe11a6c7fcc1e0b39b5e0d347c04248f750b03b0977b3ad6b531fe6f358`; Node22.23.3.
- Worker/side: `zhipu/glm-5.3[1m]`, default reasoning. SDK strips the context marker for API requests; actual provider response `glm-5.3` was verified. No stronger alias fallback permitted.
- Execution mode off; existing/facts differ only in assistance mode. Read-only source assistance retains its bounds and evidence checks. Probe/recovery are not activated.
- Deterministic shuffled schedule seed53, 50-minute agent/verifier limits, no automatic paid task retries.
- Agent receives original instruction and clean repository, isolated config, no MCP/web tools/personal plugins, no hidden verifier/gold files, no Docker socket. Only model gateway egress.
- Agent patch captured against immutable base commit, including changes committed by the worker. Entire worker container destroyed before strict patch replay in a new pinned scoring container. Official verifier unchanged.
- Environment readiness requires empty raw reward0 plus reference reward1 and parsed target-test evidence for the positive control. Parsed compile/import/hook failures are valid negatives once the reference passes; live failures before test execution are marked separately. Missing/malformed parser output and unvalidated dependencies never certify success.

## Setup evidence and repairs

Initial six-case environment pass verified NodeBB, Ansible, Element Web, OpenLibrary and Qutebrowser. Flipt initially failed because our `bash -lc` invocation reset the image's Go PATH. The image has Go1.24.3 in `/usr/local/go/bin`; `bash -c` preserves it. Both agent and grader now preserve image PATH, with only `/opt/eval` prepended for agent tools. Official source/test artifacts were not edited. Corrected full-set validation is recorded separately from the initial diagnostic pass.

The internal Docker network probe reached gateway health successfully, while direct public IP and host service access were blocked. One direct 64-output-token model identity preflight returned GLM-5.3. Three CLI setup probes were rejected locally before any upstream model request while resolving the SDK's context-marker normalization. The fourth full CLI probe returned OK in about9.4s: observed3300 input,37 output,768 cached tokens. This setup traffic is separate from benchmark attempts. Native CLI costBasis was unknown, so its dollar estimate is not used.

A free50ms runtime timeout probe killed the worker's descendants, recovered the partial patch and removed the container. A fresh-context review found committed-patch capture, infrastructure-score classification and incomplete-usage accounting issues. They were fixed with observed RED/GREEN regressions. `node scripts/check.mjs` passed144 host tests, existing scorer checks and four new SWE Pro self-test groups. These checks establish mechanism behavior, not model quality.

## Results and accounting

Formal task outcomes, paired quality, latency, usage and source-fact delivery are pending the full environment gate and requested live round. Actual total dollar cost remains unknown unless provider billing can be reconciled. Missing final usage remains null; observed usage is retained separately as a lower bound.

Artifacts are ignored under `eval/results/swe-pro-glm53/`; setup/materialization/runtime under `.superpowers/sdd/2026-10-13-local-swe-pro-glm53/`. Source materials and generated logs are not committed. The static task manifest preserves its original provenance and readiness snapshot; current status comes from execution receipts.
