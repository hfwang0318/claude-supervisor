# Core assistance pilot — 2026-10-12

## Scope and frozen comparison

First round: task 0 and task 1 only. A selects `existing`; B selects `facts`.
Both use supervision on, independent execution off, the same worker and side model,
and the shared limit of 2 side calls, 4,000 output tokens and 30 seconds per prompt.
No reference model is required. `probe` and `recovery` are reserved and inactive.

Four unchanged engineering fixtures: `entrypoint`, `multi-file`, `api-contract`,
`simple-change`. Hidden acceptance stays outside the agent workspace. Function,
constraints and honest reporting are scored separately. A correct location or an
honest failure does not earn functional success. Runner and experiment metadata
record the corpus hash, models, modes and 180,000 ms task deadline.

Planned screening: 2 repetitions per task per group, 16 attempts. Before live work,
freeze model/version/effort, actual host/runtime, permissions, plugin SHA, fixture
hash, group order and cost policy in distinct A/B output directories. Missing
price or per-call usage remains unknown; no estimated cost advantage is claimed.
The user authorized current Claude configuration and manual approval between tasks
when complete cost cannot be reconciled. No automatic paid continuation in that case.

## Engineering evidence

Baseline `7659edd`: `node scripts/check.mjs` passes 121 host tests and existing
scorer/process checks. Task 0 observed RED for missing assist suite, then GREEN for
hidden functional scoring, protected tests, no-reference configuration, isolated
mode snapshots and killing the full main-agent process group at the configured
short deadline. Launcher and eight-task engineering scorer checks also pass.

## Results and gate

One of 16 planned live attempts completed; 15 remain unrun awaiting per-task authorization. No quality or cost improvement is claimed. The first result is an existing-mode control, with no facts-mode result yet.
Task 2 cannot start until two different target tasks provide auditable useful
facts, changed worker actions and passing independent acceptance, with A results
and all overhead reported. No CentOS 7 validation has occurred.

## Implemented facts mode and final review

Source inspection uses file-descriptor identity checks, bounded literal searches,
exact excerpts and host-owned hashes for all read/search sources. It rejects
incomplete/secret/unsafe inputs and rechecks the entire source group after later
reads. Packet validation requires a real import/call excerpt and exact current
requirement quotation; semantic explanation stays unverified. New prompts, off,
cancellation and workspace changes discard old replies. The final hook validates
binding and sources after its awaited UI work; the log records `context-returned`,
which does not prove worker adoption. A per-prompt fact job never retries.

Fresh independent review found three Important issues: an early source changing
while a later source is read; invalidation during the final UI state read; and
trigger omissions for unrelated imports/non-final tool results. All were reproduced
with failing tests and fixed in one pass. The output-cap boundary and telemetry
redaction were also covered. Full engineering checks pass 142 host tests, manifest,
TypeScript, real process/facts checks and nine scorer selftests. Node 22.23.3 passes
pure/scorer and real-file facts checks on macOS; CentOS 7 remains untested.

One review minor remains: stream output decoded per stdout chunk may corrupt a
multi-byte UTF-8 character split between chunks. JSON/tool structure is retained,
but exact non-ASCII replay text is not fully guaranteed at that boundary.

## Frozen first-attempt configuration

- Worker and side: `zhipu/glm-5.3[1m]`; endpoint version unreported; reasoning `default` (no explicit effort override).
- Host: Claude Code `2.1.295`; environment: `local Darwin 27.0.0 arm64, Node v26.5.0, no container`.
- First plugin snapshot: `ab8393eb0efa9a237c32d42853cb90b7474638d1`; corpus SHA-256 `817c34650c7b7309964324b0aa5c2dc8b9601cc0c6ca9247c0cf8f878d5aba43`. Launcher MCP fix was applied before the successful attempt; final review fixes postdate it.
- Supervision on; independent execution off; explicit worker/side IDs, same permissions, 180000 ms worker process-group deadline. Current endpoint/auth settings supplied through an ignored temporary file; hooks/plugins/MCP/context settings from the personal configuration were excluded. No credentials committed.
- Prices/per-call accounting unknown. Aggregate worker usage retained; the first attempt's side-call numeric usage was redacted by host debug logging and cannot be reconstructed. Subsequent numeric telemetry uses input/output/cached fields and raw worker tool-stream retention.
- Permission policy: `Read,Write,Edit,Bash(ls:*),Bash(cat:*),Bash(grep:*),Bash(wc:*),Bash(head:*),Bash(tail:*),Bash(python:*),Bash(python3:*),Bash(node:*)`.
- Random group order seed: `20261012`; two planned repetitions per task/group.

| Attempt | Task | Mode | Planned repetition | Status |
|---|---|---|---|---|
| 1 | multi-file | existing | 1 | passed independent acceptance |
| 2 | entrypoint | facts | 0 | unrun; awaiting authorization |
| 3 | multi-file | existing | 0 | unrun; awaiting authorization |
| 4 | multi-file | facts | 0 | unrun; awaiting authorization |
| 5 | api-contract | facts | 0 | unrun; awaiting authorization |
| 6 | entrypoint | facts | 1 | unrun; awaiting authorization |
| 7 | multi-file | facts | 1 | unrun; awaiting authorization |
| 8 | entrypoint | existing | 1 | unrun; awaiting authorization |
| 9 | api-contract | existing | 1 | unrun; awaiting authorization |
| 10 | api-contract | existing | 0 | unrun; awaiting authorization |
| 11 | api-contract | facts | 1 | unrun; awaiting authorization |
| 12 | simple-change | facts | 1 | unrun; awaiting authorization |
| 13 | simple-change | facts | 0 | unrun; awaiting authorization |
| 14 | simple-change | existing | 0 | unrun; awaiting authorization |
| 15 | entrypoint | existing | 0 | unrun; awaiting authorization |
| 16 | simple-change | existing | 1 | unrun; awaiting authorization |

## Actual outcomes

A preliminary launcher failure exited before any model call: Claude Code 2.1.295
requires an empty MCP config shaped as `{"mcpServers":{}}`, and rejected `{}`.
The failed row is retained separately under ignored local results and does not count
as a completed model comparison. A fake-launcher regression reproduced the error
and then passed after correction.

The first authorized model attempt was `multi-file / existing`: functional success,
protected-test compliance and honest reporting all passed; 56 seconds, 10 worker
turns. Worker aggregate usage: input 4555, output 1055, cached input 76800. Debug
logs show two side requests (one answered, one unknown/aborted) but their actual
usage numbers were redacted; complete cost remains unknown. This first attempt
retained final answer/workspace/debug evidence but predates full tool-stream
retention, so it is not a complete causal path audit. It is not silently replayed.

The next scheduled attempt is `entrypoint / facts`. The user was asked to authorize
this next task because complete cost is unknown; no answer has been received at
this checkpoint. No further paid task was started. Screening and its continuation
gate remain incomplete; tasks 2 and 3 remain conditional and inactive.

The final implementation is `eaf9985d78dc976887812574895a04954b1ee189`. Future comparison attempts are refrozen at this revision. The first exploratory existing result predates the review fixes and cannot be pooled as a same-revision matched comparison; retain it as a preflight result rather than silently rerunning it. The 16-attempt controlled comparison remains incomplete.
