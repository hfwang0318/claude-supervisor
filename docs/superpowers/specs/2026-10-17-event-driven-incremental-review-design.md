# Event-driven incremental review — design draft

Status: proposed production design. Callback direction and adjustable implementation parameters approved in conversation; this document makes the design concrete. No production scheduling change is implemented by this document or the replay corpus.

## Intent and authority

Improve all research-grounded engineering reviewer capabilities at controlled total cost with a side model no stronger than the main model. Main tasks finish naturally. Advisory output may be natural language with all important distinct concerns. Use real evidence, preserve privacy, command restrictions, isolation/read-only degradation, cancellation and honest unknowns. These are requirements/project principles.

The user clarified that other implementation choices may be optimized: regex attribution, exclusive phase gates, last-six selection, fixed token/call counts, N, asynchronous vs waiting behavior and future experiment selection are not immutable user requirements. Prior frozen experiments and their controls remain historical and unchanged. No merge/push or host/Router modification is needed for this design. The old automation was deleted; it is not recreated here.

## Recorded evidence and replay boundaries

Local round001–017 archives contain 17 behavior audits, 34 runs and 34 trajectories totaling270166356bytes; 255 protected critical hashes verified.12rounds have a prepared-input archive,10an actual-reply archive,9a feedback archive. An archive may represent zero input/no call; a missing archive does not imply an observed absence. Earlier partial/clipped material remains unavailable rather than reconstructed as accepted input.

A curated eight-case public corpus lives at eval/data/review-replay-v1/cases.json. It includes real prefixed technical intentions, search-only fallback, technical text before first edit, queued without visibility, natural multi-concern output, mixed sensitive/safe material, scaffold-vs-project failure and acknowledgment after self-correction. Source paths/hashes bind the excerpts/labels. No raw logs, thinking or private session metadata are included. Human quality labels are test oracles for inspection, not automated proof that a model understands the case.

Ignored local inventory and normalized timing traces: .superpowers/sdd/2026-10-17-callback-review/inventory.json and public-event-traces.json. The extraction script reads records without executing candidate commands or invoking models. These timing traces cannot recreate original workspaces or provider responses.

## Decision: hybrid opportunities, no exclusive semantic phase gate

Use typed callbacks to establish what happened, in what order and against which version. Public narrative, observations and proposed edits are material; phase words do not grant or deny admission. Reviewer decides which dimensions deserve attention in the same call that performs the review. It need not return an exhaustive category list or machine-readable classification.

One step means one completed main-loop model response, keyed by actual turn/step identity. Parallel tools, individual text chunks, side-model calls and subagents do not each advance N. Historical gateway message_delta timestamps only approximate this unit; actual host callbacks must be verified.

Ordinary opportunities accumulate meaningful new material across steps. N is a configurable scheduling threshold, not a mandatory model call. Repeated identical observations or unchanged state do not make a new opportunity. Urgent/important evidence creates opportunities independently: first explicit write before execution, completed failed check, materially changed verification evidence and impending completion. A read failure is not automatically a project check failure.

Initial comparison set N=3/5/8; N=5 may be a free-probe starting parameter, not a selected optimum or permanent requirement. Offline17supervise streams yield882/287/170/101periodic candidates forN=1/3/5/8. All9streams with explicit writes have their first periodic candidate before first write for all four thresholds. These counts lack novelty filtering and are candidate upper bounds, not calls/cost/quality predictions. They show that a larger N reduces frequency but does not identify mature technical material.

## Capture, material and delivery

1. Observe turn.step public text chunks; preserve stream chunks/results unchanged and exclude thinking from review storage. Use session/turn/step/block identity internally for assembly, deduplication and ordering. Validate final/partial/aborted behavior before relying on it.
2. At tool.call before Edit/Write, freeze requirement, public narrative, relevant existing source/observations and proposed tool input. Proposed edits remain explicitly proposed, not completed changes. Tool emission alone is not proof of execution. Bash/external writes need version/change observation; late discovery is labeled late, not invented as a pre-edit checkpoint.
3. After tool return/batch, record actual output, error/exit/truncation and workspace version. A pass only addresses its actual command/scope/version. Carry unresolved failures and counterevidence with original sources.
4. Build an incremental packet: authoritative requirement, checkpoint/version, new public text/observations/changes since last reviewed checkpoint, and relevant prior anchors. A compact digest provides an index, never replaces source excerpts. Report privacy/budget omissions. Model-produced summaries remain attributed and unverified. Do not turn absent history into a negative fact.
5. In one model request, ask which currently evidenced dimensions warrant review and review them together. It may explain insufficient input, identify conflicts, suggest evidence or discuss tradeoffs. Keep original natural-language report; no one-issue/category/echo-ID requirement. Optional executable actions retain strict bound schemas and source/isolation gates.
6. Deliver at a safe native boundary with the reviewed checkpoint visible. Later project changes do not erase historical advice, but old tests/actions cannot certify new sources. Explicit cancellation or a new task revokes old work and delivery. Final drain/follow-up remains finite.

## Frequency, concurrency and budget

Budget is explicit/configurable rather than a fixed one-call goal. Measure input/output usage where available, full cost unknown when not reconcilable. Limits continue to prevent runaway review; no hidden stronger fallback. Comparing N must compare missed opportunities, redundant/conflicting reports, latency, input growth, observed usage and main outcomes, not checkpoint count alone.

Keep one semantic request active initially to bound duplicate work. While active, coalesce ordinary dirty deltas; retain milestone checkpoints separately so latest-only coalescing cannot discard first-write evidence. Bounded retention reports omissions. Do not start another identical review merely because N elapsed while waiting.

Start with asynchronous capture/review and safe-boundary delivery as one candidate. Compare an explicit first-write review barrier separately if native ordering and hook lifetime permit it; callback code should capture quickly. The user has not prohibited waiting. No unverified claim that tool execution always waits for a completed turn.step response is allowed.

## Free acceptance suite before paid testing

- Native order: public text before tool call; mixed text/tool response; partial chunks; parallel tools; Bash mutation; resumed/compacted context; headless operation; completion and interruption. Preserve frozen CLI/Node/loader bytes.
- Scheduler: N thresholds, no new material, event priority, one in-flight request, milestone preservation under coalescing, no side/subagent recursion, finite budgets, cancellation/task switch and late feedback.
- Material/protocol: original prefixed/Let-me technical text retained; search narration cannot monopolize opportunity; relevant earlier reads/counterevidence survive summarization; private records omitted individually; bounded text natural multi-concern acceptance; optional actions still strict.
- Audit: queued vs delivered vs visible vs acknowledged vs changed action separated. Corrections before feedback are not credited to it. Current known Round017 failure is retained as an open regression target, not relabeled passing.

Use the eight real cases plus targeted synthetic controls for races absent from historical data. Deterministic replay verifies mechanisms only. Recorded responses can test parsing/delivery without a paid provider but cannot test whether a new prompt produces a better judgment. No replay can claim the original official patch was repaired without independently checking it.

After implementation, run author RED→GREEN regressions and the full ordinary engineering command. Only then design a small real observation with explicit capability question and cost bounds. Historical fixed-random failure selection is not a permanent restriction on new experimental design. No paid run is launched by this draft.

## API evidence

- Current native generated declarations: turn.step chunks/results and tool.call are available; read only, never modify generated declarations.
- Official function-hook documentation: https://code.claude.com/docs/en/plugins/mods/events
- Official tool-hook boundaries: https://code.claude.com/docs/en/hooks#posttooluse

Availability is verified from declarations/docs. Stable event order and capture timing in the frozen native/headless host remain free-probe acceptance work.
