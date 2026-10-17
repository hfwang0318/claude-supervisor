# Callback-driven incremental review: implementation and free evidence

The approved event-driven design is implemented in the isolated `codex/facts-delivery` branch. Semantic supervision now defaults to callback-grounded incremental opportunities. `assistance_mode=existing` retains its previous behavior; `review_schedule=legacy` explicitly preserves the old stage admission. No paid evaluation, merge, push or automation restart was performed in this batch.

## Resulting behavior

- Native public text is captured while `turn.step` streams, with opaque/thinking chunks passed through unchanged. Native observation proved that `tool.call` can begin before the step result returns, so reading only the finished answer misses the first-write boundary.
- Before the first explicit Edit/Write, the plugin freezes the public narrative and proposed input. Pending transcript tool entries are excluded from actual changes. Completed tool results and bounded changes become later material. Shell-based mutations do not promise pre-write coverage.
- One completed main request is one step. Ordinary opportunities use configurable N (default5), skip empty/identical retained material, and coalesce while one reviewer runs. First explicit write, newly recorded check failure, verification and completion are milestone opportunities. End-turn responses go through the completion checkpoint instead of buying an extra ordinary review.
- The reviewer selects applicable engineering dimensions and reviews them together in its natural-language/Markdown report. Narrative is not host-certified as a plan; proposed edits are not executed facts. New-to-window source IDs, prior anchors and omission flags are explicit. Earlier history remains incomplete.
- Default incremental reservations are3calls/12000output tokens per user prompt, including optional source-selection calls. Admission protects both call slots and verified wire-output capacity for completion. An early failure may use the early-write reservation. Legacy remains2calls/4000. Model waiting has no plugin timeout; tools, validation and cleanup retain the existing finite activity budget.
- Optional machine actions retain their original source/version/command/isolation gates. Advice is unverified; text commands do not execute. Late advice can remain historical while old action evidence cannot certify a new source.
- New runtime identities bind schedule, interval and budgets. Old frozen identities remain legacy observations, with no rewriting of their results.

## Free regression and native checks

`node scripts/check.mjs` completed successfully, including manifest/hook contracts, TypeScript, **332 host tests**, real read-only/scoped-fact/process-isolation checks, recorded regressions, every scorer selftest and every SWE Pro selftest. The complete command was not narrowed.

`node eval/replay-review.mjs` executes eight curated cases from the17-round/34-run archive through applicable production context/parser/scheduler/delivery functions. Local provenance verification matched10 source artifact hashes. The recorded36/2/34 privacy shape drives synthetic secret controls because the actual private bytes are intentionally absent. Semantic quality labels remain manual; this is not a model-quality score.

A timing-only N3/5/8 sweep over the public traces yielded287/170/101 periodic candidates before novelty filtering, critical events, coalescing and budgets. These are neither dispatched calls nor cost/quality estimates. N5 is a configurable starting point.

Two final offline native gates used the unchanged frozen2.1.295 Linux CLI, Node and GNU loader, with Docker networking disabled and a loopback synthetic provider. No candidate-project command or paid model call ran; one isolated fixture Write and three synthetic `printf` steps exercised the actual tool lifecycle.

| Gate | Observed mechanism |
| --- | --- |
| Normal incremental flow |2semantic requests: first-write and completion. First-write contains exact public narrative plus proposed input, no actual change. Completion contains an actual change and3distinct tool observations. Prepared public contexts match actual synthetic-provider contexts after session-ID omission. Both complete multi-concern reports appear in actual main requests5/6. Driver exits0. |
| New input while review waits | Old task review is cancelled and its report ID never appears in later main requests. New-task completion report is visible.2user inputs are explicitly adopted into1native result, followed by1bounded plugin followup result; driver exits0. |

The native multi-input probe initially exposed a conservative driver hang:2SDK user inputs can be adopted into one result. The adapter now supplies missing public input UUIDs and uses the native result's explicit adopted-input IDs when computing completion coverage. Missing/ambiguous IDs receive no coalescing credit; earlier results cannot close an unadopted new input. It does not infer completion from elapsed time or idleness, replay an accepted task, or change native input semantics.

Local evidence is retained under `.superpowers/sdd/2026-10-17-event-driven-incremental-review/`:

- `batch-final-checks.log`, `record-replay.json`, `protected-results.json`;
- `native-order/receipt.json` for callback order;
- `native-release-gate/receipt.json` and `native-cancel-release-gate/receipt.json`, with tested code/adapter hashes;
- the progress ledger and individual RED/GREEN logs.

Logs and results remain ignored. All **255 prior critical receipt hashes** from rounds001–017 were verified unchanged. AGENTS.md, node_modules, generated host declarations, frozen binaries and the global Router were not edited.

## Review and limits

One fresh whole-change gpt-6.1-sol review found upstream generator cleanup/delegation and output-reservation defects. Both received failing regression tests and fixes; the entire engineering suite passed afterward. Additional native/author checks covered pending-write misclassification, end-turn duplicate spending, optional tool IDs, private-tool omission flags, empty user/tool-result rows and preservation of distinct repeated failures. No repeated fresh review was commissioned.

The callbacks establish public timing and provenance, not reliable semantic judgment. First-write capture is asynchronous; a report may arrive after execution has advanced. Finite source/queue/budget/followup limits can leave later material unreviewed, and omissions remain explicit. Source snippets are bounded records, not a full current diff. Reports do not automatically certify dimension coverage, correctness, consumption, causality or independent quality gains. Provider reasoning behavior and real usage/cost remain unknown outside the previously observed evidence.

The next live observation must freeze the new controls and tested output, and ask a concrete new question: whether reviewer-selected dimensions yield grounded, distinct concerns from real incremental evidence, and whether the main model takes a useful action that precedes independent validation. Compare that behavior and total measured cost/latency without reinterpreting the historical stage-gated rounds. This batch does not automatically start another paid random loop.


## Real-model targeted pilot 001 — launched

The user explicitly authorized real-model testing after the free gates. On 2026-10-17T15:54:27Z one detached controller (initial PID91646; current PID files take precedence) started `eval/results/incremental-review-flash/pilot-001`. Frozen product/source is `e0b2717d5c4414224bf6a5f764d3a856cb9d1741`; later report commits do not change that source. The native preflight completed in9409ms, networking disabled,0model calls. Dry-run scheduled exactly2attempts with task timeout null. At this report the runner is calibrating the environment; pending does not mean a provider has accepted a model request.

This is a deliberately targeted first observation of Proton e65, selected for historical public technical narration, editing and verification opportunities. It is not a random draw, representative benchmark, continuation score or a new complete parent cohort. The single-task manifest hashes back to the original30-task manifest; historical complete caller-scope full4 remains unchanged. The runner's `summary-baseline.json` filename describes its execution mode, not a full30-task baseline.

E uses existing assistance; S uses supervise with incremental scheduling, interval5completed main steps,3maximum semantic calls and12000verified-wire output reservation, including completion reservation. Public native cap remains4000per call (requested1952plus host2048), effort low is a field rather than proof of provider reasoning behavior. Both main and side identities are explicitly `zhipu/glm-5.3-flash`; no stronger fallback or purchase. These settings differ from historical phase-gated rounds and do not isolate a single-factor quality effect.

The VM currently exposes10CPUs/12526370816bytes; each candidate has1CPU/4GiB,2worker slots and supplier upper bound4. Capacity pressure pauses new admission; provider429 drains accepted work without restart. Main timeout is none/null through natural completion and finite review followups; preparation, grading and tool timeouts retain their bounds. No second runner, accepted-task retry, next paid task or automatic full run is authorized by this pilot.

The launch gate binds full332-test engineering checks, actual-record regression, native normal/cancellation receipts, native preflight, frozen runtime/manifest, controller and adapted basic audit by SHA256. The controller runs this pilot's basic audit once after natural completion. Full behavior audit must then compare prepared and actual provider contexts, public replies, delivery and next main requests, subsequent actions and independent results. Trace all applicable engineering dimensions with honest no-opportunity/input-insufficient/pending distinctions; assess unsupported claims and counterevidence as well as useful suggestions. Acknowledgement, report visibility and official scores alone do not establish a benefit.

A10-minute heartbeat monitors only this pair and its final audit. Routine healthy progress is quiet; completion, actual fault or required user action can notify. It deletes itself after the final behavior audit and report. Full usage and cost remain unknown until reconciled; SDK zero is not zero consumption.
