# Event-driven incremental review implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline in the existing isolated worktree. User authorized execution of the new design; do not ask again between tasks. No per-task subagents or repeated fresh reviews.

**Goal:** Replace brittle phase admission with callback-grounded incremental opportunities, preserving all core review dimensions and safety/evidence boundaries.

**Architecture:** Native public response/tool callbacks feed a pure opportunity/material ledger. Critical checkpoints plus configurable meaningful-step intervals schedule one review at a time; pending ordinary changes coalesce while milestones survive. Reviewer selects applicable dimensions in the same natural-language report. Legacy scheduling remains explicitly selectable for compatibility.

**Spec:** docs/superpowers/specs/2026-10-17-event-driven-incremental-review-design.md (approved by user instruction to continue according to the new design).

**Tech Stack:** TypeScript native function hooks, pure modules and host tests; Node evaluation adapter; frozen Linux CLI/Node/loader offline fixtures.

## Global constraints

S<=M explicit model identity; privacy/redaction, command restrictions, isolation/read-only fallback; unverified advice separate from fact/action evidence; natural main completion; no thinking capture. No host/generated declaration/frozen result/Router edits, merge or push. All current implementation parameters may be optimized. Preserve255old critical hashes.

## Review focus

Callback order/parallel execution and partial aborts; pre-write proposed input versus actual changes; pending milestone retention; new task/off/cancel/worker switch; side/subagent recursion; finite configurable reservations and no timeout on semantic waiting; stale advice versus executable actions; no mandatory category JSON; historical actual fixtures remain labeled mechanism/quality evidence accurately.

## Tasks

### Task 1 — prove native capture boundary
- [x] Offline same-frozen-host local command probe drives a synthetic response through actual turn.step and tool.call callback chains, reads public text, records exact callback ordering and tool result. No provider, project mutation, host modification or thinking capture.
- [x] Retain receipt/trace and document any boundary limitations before integration.

### Task 2 — pure opportunity ledger and incremental material
- [x] RED then GREEN: step identity dedup, meaningful delta threshold, no new data/no call, first-write priority, failure/completion, ordinary coalescing, milestones retained, bounded omissions and reset.
- [x] RED then GREEN: raw public narrative/proposed edit retained without regex-plan requirement; requirement/prior anchors/new evidence and explicit scope; secret records omitted independently; proposed changes never actual facts.
- [x] Execute eight actual record cases through applicable production functions. Mark semantic quality labels separately.

### Task 3 — host callbacks, configurable policy and budgets
- [x] RED then GREEN actual host tests for pre-write capture with Let-me text, callback counting, delayed/parallel tools, queued opportunities, cancellation/off/new task, no side/subagent recursion, final drain.
- [x] Add configurable incremental schedule/step interval and finite call/output limits; default incremental only for semantic supervision, existing mode unchanged. Preserve explicit legacy schedule and legacy tests, output-cap verification and no stronger fallback.
- [x] Bind new scheduling/budget controls to newly frozen runtime identity; reject mismatch, preserve old frozen identity compatibility. No old result edits.

### Task 4 — free native end-to-end and complete checks
- [x] New frozen native fixture with network disabled: actual public text -> before-write immutable capture -> one multi-concern recorded report -> actual next main request visibility; later edit/cancel controls, zero paid calls.
- [x] Compare candidate N3/5/8 via actual recorded trace harness without quality/cost extrapolation.
- [x] Run all node scripts/check.mjs without narrowing; inspect pass/fail counts, diff and protected hashes. Sync English/Chinese documented behavior.

### Task 5 — final review and next observation decision
- [x] One whole-change fresh review only if warranted by integration complexity, gpt-6.1-sol only; meaningful fixes each RED->GREEN then complete suite.
- [x] Commit results and exact limitations. Define a bounded live observation only after free gates; do not automatically restart old automation or paid random loop.

Execution evidence and limits: [2026-10-17 incremental review](../../evals/2026-10-17-incremental-review.md). Local progress ledger retains RED/GREEN details. Workspace and frozen results preserved; no merge/push or paid restart.
