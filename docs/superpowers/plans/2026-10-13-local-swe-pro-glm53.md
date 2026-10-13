# Local Docker SWE-bench Pro V2 comparison with GLM-5.3

Authority: the user's request to establish the local Docker environment and run one comparison round. Task selection and grading boundaries follow `docs/research/2026-10-13-swe-pro-v2-subset-v1.md`. Continue inline in the existing isolated worktree.

## Global constraints

- Freeze the existing 30-task manifest, official source commit, artifact hashes and Linux/amd64 image digests. Use the six smoke cases first; do not replace tasks based on outcomes.
- Both worker and side model explicitly use `zhipu/glm-5.3[1m]`, provider model `glm-5.3`, default reasoning. One run per task per arm: `existing` and `facts`, deterministic shuffled order, 50-minute agent and verifier limits, one concurrent task given Docker's 4.8 GiB memory.
- Agent sees original instruction and clean repository only. Hidden verifier and gold patches stay on the host until a fresh grading container is created. No Docker socket or host workspace mounts in the agent container.
- Agent network permits only a dedicated model gateway. Disable web tools, external plugins, MCP, personal/project settings and stronger model aliases. Gateway restricts route and model, keeps provider credentials on the host, and records actual response model and usage without request contents or credentials.
- Never grade an agent-modified environment. Kill the agent container after capturing its tracked and new-file git patch; apply that patch strictly to a fresh pinned image and run the unchanged official verifier.
- Empty patch must score zero and reference patch one before paid runs for each task. Environment failures are distinct from model failures; timeout/unknown does not certify success. Actual unreconciled dollar cost stays unknown.
- Preserve images and reproducible receipts, no global Docker prune or destructive cleanup. Raw logs, task materialization and credentials remain ignored. No merge or push.

### Task 1: Verified materialization and independent Docker grading

Files: `eval/swe-pro/docker.mjs`, `eval/swe-pro/selftest.mjs`, ignored task/cache/run directories.

Interfaces: manifest task -> hash-verified artifacts; task + patch -> fresh container verifier receipt; no model invocation.

1. Add failing behavior tests for corrupted artifacts, nonzero patch application, absent/malformed rewards, timeout cleanup and readiness requiring empty zero/reference one.
2. Implement digest-pinned single-container grading with CPU/memory limits and strict patch application, copy official tests only to grading container, retain complete logs and structured receipts.
3. Run the six smoke empty/reference checks, then all 30. Diagnose infrastructure failures without modifying official tests or treating them as quality failures.

### Task 2: Locked Linux agent runtime and model-only gateway

Files: `eval/swe-pro/gateway.mjs`, `eval/swe-pro/agent.mjs`, self-tests and runtime receipt.

Interfaces: frozen plugin + pinned Linux Claude/Node -> agent runtime; restricted gateway -> explicit GLM-5.3 responses and usage audit; task instruction -> captured patch/trajectory.

1. Add failing tests for disallowed endpoint/model, response-model mismatch and credential-safe metadata. Implement request allowlist and model identity guard.
2. Pin Claude Code 2.1.295 and Linux Node runtime; copy frozen plugin outside repository, configure the two arms via defaults. Disable personal settings, MCP and web tools.
3. Use an internal Docker network and dedicated forwarding service as the sole egress path. Check external network denied and model route reachable before paid task runs.
4. Ensure cancellation/timeout destroys the model container and descendants before fresh replay. Record runtime, plugin tree hash, gateway behavior, actual model IDs and unknown costs.

### Task 3: Frozen one-round comparison and reporting

Files: `eval/swe-pro/run.mjs`, self-tests, `docs/evals/2026-10-13-local-swe-pro-glm53.md`, updated subset README.

Interfaces: readiness receipts + fixed manifest -> deterministic 60-job schedule; agent receipt + independent verifier -> arm statistics and task results.

1. Add failing tests for scheduling exactly once per task/arm, resume refusing changed configuration and not reusing incomplete runs as successful results.
2. Run project checks and one fresh-context whole-change review; fix important findings with regression checks, then freeze implementation for the comparison.
3. Execute all environment-valid pairs with GLM-5.3, preserving every attempt and structured progress. If setup is blocked, retain evidence, diagnose bounded alternatives and state the concrete blocker.
4. Report paired pass counts, latency, usage, facts delivery and changed-action evidence; separate infrastructure failures and unknown fees. Do not present the project subset as the official full benchmark score.

Completion requires actual local Docker setup, validated scoring environments and the requested live comparison, or a documented externally blocked setup that cannot be resolved locally. Code/scorer checks alone are not model-quality evidence.
