# Historical Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. The user approved the written design and explicitly requested implementation; continue without another authorization question.

**Goal:** Let semantic reviews finish without a plugin model-wait timeout and deliver accurately scoped historical advice while the main model continues.

**Architecture:** Freeze each review's sources and host checkpoint, separate task identity from workspace freshness, and schedule semantic work outside blocking hooks. Keep at most one in-flight review and one ready result; actions and current correctness evidence retain strict source checks and a separate tool activity budget.

**Tech Stack:** TypeScript Claude Code plugin API, native CLI 2.1.295, existing coordinator and review flow, Node free fixture/scorer checks.

**Spec:** `docs/superpowers/specs/2026-10-16-historical-review-design.md` (user approved).

## Current status

The repository-owned headless adapter now announces cancellation through a private revision file before forwarding native input. Free actual-plugin new/off cancellation and late35s delivery passed;250 host tests and all ordinary checks passed. Final whole-change review and latest native repeat are pending. No Claude Code/Router/generated declarations changed; direct native clients without this adapter and interactive terminal cancellation remain unverified. No paid follow-up. See [evidence and limits](../../evals/2026-10-16-historical-review.md).

## Global Constraints

- Worktree `adaptive-eval/claude-supervisor`, branch `codex/facts-delivery`; no merge/push; preserve AGENTS.md, node_modules, all frozen results.
- Main/side model `zhipu/glm-5.3-flash`; no stronger fallback, no paid call during implementation or native feasibility tests.
- Semantic modes share two model calls / 4000 output tokens per real user prompt. No plugin timeout on model waiting; retain 30000ms total tool/validation/cleanup activity budget.
- Normal progress preserves historical advice. New task/project/configuration, explicit cancellation, off, unload and session end invalidate it.
- Old sources/tests cannot certify current code; no historical action executes against changed sources. No fabricated plans, stable message IDs, acceptance or consumption.
- Full `node scripts/check.mjs` at the completed batch gate, not paid observations per change. Existing mode remains compatible.

## Review Focus

- A review survives more than 30 seconds and a later edit, without blocking the next main-model tool batch (Tasks 1, 3).
- An old review resolves after a new user prompt or model change and must neither deliver nor consume the new prompt's budget (Tasks 2, 3).
- The main model ends its turn before a result; headless exit/session cancellation is reported honestly and never held open by an unbounded Stop (Tasks 1, 3).
- History-only location/probe/recovery requests never run on the current workspace, while their sourced advice remains deliverable (Tasks 2, 3).
- Repeated callbacks/hooks cannot duplicate delivery, reset model/tool budgets, or create an unbounded job/candidate queue (Tasks 2, 3).

## Task 1: Free native background capability gate

**Files:** fixtures and receipts under `.superpowers/sdd/2026-10-16-historical-review/`; no product code.

**Interfaces:** Actual `clock.after`, `model.complete` without timeout, `session.append`, lifecycle hooks against a local synthetic delayed provider and the same frozen CLI/Node/GNU loader.

- [x] Build a network-none native fixture with synthetic main tool steps and delayed side replies. Assert the main request continues before the side result and feedback appears once in a later main request.
- [ ] Exercise headless final-answer/session-end behavior and explicit abort. Record real terminal outcomes; if unsupported, ledger the limitation and select only a proven delivery path before coding.
- [x] Save safe metadata and synthetic fixture output; no real credentials/thinking or external requests. Expected: explicit capability receipt, zero paid requests.

## Task 2: Checkpoint protocol and separate freshness/budgets

**Files:** `types/index.d.ts`, `supervisor/contracts.ts`, `supervisor/coordinator.ts`, `supervisor/review.ts`, `supervisor/review-flow.ts`, corresponding `tests/*`.

**Interfaces:** Host-owned `ReviewCheckpoint`; `sameTask(a, b)` excludes source revisions; checkpoint echo validation in `parseReview`; historical review notes identify captured/current checkpoints. Coordinator supports semantic model-wait exclusion without altering existing default behavior.

- [x] RED tests for checkpoint spoofing, history reference notes, >30s model waiting, task cancellation and unchanged two-call/token reservations.
- [x] Add typed immutable checkpoint provenance from real tool IDs and local observation sequence; preserve privacy-normalized diagnostic output.
- [x] Separate current-source checks from same-task advisory validity; historical actions produce an unexecuted suggestion instead of running old coordinates.
- [x] GREEN relevant host/pure tests, then commit this independently testable protocol/scheduler core.

## Task 3: Background scheduling and exactly-once historical delivery

**Files:** `hooks/register.ts`, focused scheduler helper under `supervisor/` if needed, `tests/review-host.test.ts`, `tests/*` for state transitions.

**Interfaces:** One per-session pending review/controller, one ready result, and a monotonic observation sequence. Launch captures immutable input and returns immediately; completion checks task identity before queuing/delivery.

- [x] RED: main batch returns while completion remains pending; resolve after a later tool edit and >30000ms; confirm historical note and no current-state certification.
- [ ] RED: new prompt/off/cancel/model/project/session end drops old result, no implicit replay, no new-budget contamination; ready feedback delivered once across repeated hooks.
- [ ] Implement only the native delivery/lifetime path proven by Task 1. Remove semantic waits from PostToolBatch/Stop and model timeout arguments; keep deterministic checks and existing-mode behavior.
- [x] Keep tool actions bounded and current-only; add scoped diagnostics for launch, checkpoint, current/history applicability, cancellation and actual delivery status.
- [ ] GREEN host tests and free native integration using actual production plugin; commit the complete hook behavior.

## Task 4: Engineering verification, review and documentation

**Files:** `README.md`, `README.zh-CN.md`, design/plan status, new evaluation capability report, eval metadata/scorer tests if interpretation changes.

- [x] Run all `node scripts/check.mjs`, inspect exact exit/failure counts, verify immutable result hashes and no lingering fixture processes.
- [ ] Run native delayed reply/cancellation/lifecycle checks on the actual product path; distinguish synthetic mechanism evidence from real reviewer quality.
- [ ] One fresh-context whole-change review of this architecture range, then one TDD fix batch for Important/Critical findings; no repeated reviewers.
- [ ] Synchronize docs with delivered behavior, explicit headless/platform limitations and remaining real-model gates. No automatic fifth paid round in this implementation task.

## Execution record

Plan authored after written-design approval. Inline execution requested by the user's “按这个方案改”; preserve the user's previous batching/cost preferences. The ledger records capability findings and any necessary deviations.
