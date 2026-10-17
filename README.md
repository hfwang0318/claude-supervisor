# deepseek-supervisor

**Evidence-based supervision for Claude Code. The side model defaults to the current worker; any explicitly selected side model is supported. Supervision relies on validated evidence, not superior model capability. Independent execution is off by default.**

[中文说明](README.zh-CN.md)

## Why

Claude Code ships a side agent, "You should know", that watches Claude at work and surfaces what it notices. It is hidden whenever `ANTHROPIC_BASE_URL` points away from Anthropic: on Claude Code 2.1.290 that one variable alone switches it off. So if you run Claude Code against DeepSeek or any other Anthropic-compatible endpoint, nothing watches the work.

A weaker model needs that more, not less. It goes wrong in a few ways again and again: "all tests pass", said about code changed since the run that passed, or about a run that failed; the same failing command run a third time with blind edits in between; an edit retried against text the file no longer holds; a test bent to fit the bug; a "don't touch config.py" forgotten; a crash on an input the request covers, that no test reaches.

An earlier version of this plugin reviewed the transcript every 6 steps, as "You should know" does. Its items were opinions, and the model could talk its way past them with one quoted line. Measured on DeepSeek, it made no difference. So this one works from evidence: what the session's own tool calls show, and what a command prints. It was built for DeepSeek, but nothing in it is DeepSeek-specific: it works with any Anthropic-compatible endpoint.

## What it does

Three checks, each where its finding is read at once.

### 1. After every batch of tool calls: rules on the record

Code reads the session's own tool calls (what ran, in what order, how it ended) and holds them to the rules below. No model, no cost, any machine, and it cannot make evidence up. What it finds goes to the model **with the tool results of that batch**, before it picks its next step.

| Rule | Raised when | Closes when |
|---|---|---|
| **stuck** | the same command failed 3 times in a row with the same error (`AssertionError: 5 != 6`), whatever was edited in between | it passes, or its error changes |
| **edit-miss** | two edits in a row to one file failed because the text to replace is not in it | the file is read again, or an edit goes through |
| **weakened-test** | an edit to a test file added a skip, removed the assertions, put in one that cannot fail, set an expected value to what the failing run printed, or a command removed a test file. Not when you said the tests may change ("the test is wrong, update it"), and not for a test the model wrote this session | the model tells you (`[ysk#N told]`) |
| **ignored-constraint** | you said "don't modify config.py" (or 不要改 config.py, or a folder: `vendor/`) and an edit changed it after you said so, before you asked for it to change ("now update config.py") | the model tells you |
| **failed-check**, **stale-check**, **no-check** | the model says the tests, the build or a check pass (or how they came out), and the last such run failed, or passed before a later edit to code, or none ran | a check passes after the last edit to code; no-check, once any check has run (what it showed is then the other rules' to hold) |
| **untouched** | it says it changed a file that no tool call touched or named | a tool call names it |
| **unopened image** | it says something about an image it made and never opened | it opens the image |

A test command is known by the head of each piece of the command line, interpreter flags and wrappers taken off (`python3 -I -m unittest`, `uv run pytest`, `npm test`, `cargo test`, `tsc`, `./run_tests.sh`), so `grep unittest a.py` is no run. A command your permissions refused ran nothing, and a runner that is not installed (`No module named pytest`) ran no checks. A claim is held against what had happened when it was said; plans, hopes, honest failures, what held before and reading the code ("I will make the tests pass", "two tests fail", "it passed before the edit", 测试还没通过, 检查过了，没问题) are not claims that a check passed.

### 2. Before the turn ends: the answer held to the record

When the model is about to hand you its answer, the same rules hold the answer to the record, plus two more:

| Rule | Raised when | Closes when |
|---|---|---|
| **unreported-failure** | the last check run this turn failed, nothing passed since, and the answer does not say so | a check passes after the last edit, or the model tells you |
| **skipped-check** | you asked for the checks to be run ("run the tests", 跑一下测试; not "don't run the tests"), none ran this turn, and the answer does not say so. Attempts your permissions refused are named | a check runs, or the model tells you |

If anything raised this turn is still open, **the turn does not end**: the model gets the items and goes on, at most twice per prompt of yours and the second time only with what is new, so the check never keeps a session going by itself. It is asked to write its whole answer again with the items folded in, since you may read only its last message. Circles and stale edits do not hold a turn; a claim about the machine ("pytest isn't installed") does not either.

### 3. Side-model checks (experimental P0 foundation)

Historical semantic reviews have no plugin model-wait timeout. The repository's
headless adapter uses a private cancel-only notification before forwarding new
input, off or interrupt; free native tests cover cancellation and a 35-second late
reply. Claude Code remains unmodified. Direct native SDK clients that bypass this
adapter can still delay input; interactive terminal cancellation is unverified.
The final whole-change review findings are fixed;253 host tests and all ordinary
checks pass. No new paid observation was started.
See [integration evidence and limits](docs/evals/2026-10-16-historical-review.md).

Leave `verifier_model` empty to use the host's current worker model, including
host aliases. Set it to use another side model. No model-ID capability ranking,
worker match or relationship profile is required. The design must remain useful
when the side model is weak or its capability relationship is unknown. Switching
the worker invalidates old results; refusal uses rules without selecting a fallback.

Each user prompt shares at most 2 side calls (including protocol retries), 4,000
output tokens. Existing/facts modes retain the 30-second activity limit; semantic
review modes exclude model waiting and retain 30 seconds for tools, validation
and cleanup. Semantic modes currently admit a model call only for the verified
public-host combination 2.1.295 and explicit `zhipu/glm-5.3-flash`. Its public
request of 1,952 tokens becomes a wire cap of 4,000 (2,048 host allowance), so
one call reserves the entire prompt budget; unused reservation is not refunded.
Other host/model combinations abstain from semantic calls with
`unverified-output-cap` diagnostics and retain record rules. Existing/facts keep
their legacy request caps, whose wire bounds are unverified. Observed excess
closes admission; request-cap usage alone is never a provider stop reason.
Native negative Grep results remain evidence but do not count as substantive
source reads for the first exploration review. Response templates include the
exact historical identities for optional machine actions; advisory prose does not need identity echoes. Missing action identities remain
rejected. Exhausted call budgets are diagnosed before preparing model input.
The verified semantic profile sends public `effort: low` as a controlled
compatibility setting; its actual provider effect and ability to produce JSON
remain unverified. It does not disable thinking. Inputs and structured JSON responses are limited
to 64KiB, advisory report text to 24KiB, candidates to three commands of 4KiB each. Oversized protocols are rejected.

`execution_mode=off` is the default. `shadow` records independent checks without
model feedback; `enabled` sends advisory findings for main-model judgment.
New prompts, off, reload and session end invalidate old jobs. In semantic review
modes, ordinary execution advances retain historical advice; source-bound
actions and evidence still require their original version.
Semantic hypotheses do not block completion. Record rules retain at most two holds
and the complete final-answer behavior.

The executor copies current files, including dirty/untracked files, into an owned
temporary directory. SHA-256 manifests compare the source before/after copying and
the copy. macOS sandboxing denies by default, limits real-directory writes, secret
reads and network, and supplies only an explicit environment without secrets.
Combined command output retention is 1MiB; timeouts terminate the process group.
Symlinks, secret paths, special files and workspaces over 10k entries or 50MiB are
currently unsupported. Without a trustworthy copy the plugin provides read-only
diagnostics and executes no side commands in the real project. Only matching owned
copies are cleaned up.

### Read-only location assistance (opt-in)

Set `assistance_mode=facts` to replace the existing side-model review with one
location task after a tool batch. The trigger is a named function candidate without
caller/import context, or an observed call/API error. Simple spelling changes can
skip it. The first call selects files/search terms; the second may return one
advisory packet or null. Both share the same per-prompt budget; their combined
input is at most 64KiB. There is no new completion hold or repair verdict.

The host reads only source text: up to 6 selected files, 2 literal search terms,
200 visited entries, 2MiB total reads, 256KiB per file and 32KiB returned data.
Secret paths/lines, symlinks, special files, missing sources and incomplete ranges
produce no packet. Every excerpt has its path, line and SHA-256. Source hashes
are checked during inspection and before delivery; changed batches, new prompts,
off and cancellation discard old results. Explanations and suggested checks remain
unverified. The host neither executes nor imports project code for this mode.

Fact selection can include up to 6 relative `searchPaths` (files or directories)
to bound literal searches in a large repository. With `paths: []`, a selected
search file returns only matching original lines; its complete contents still
contribute to its hash and version checks. Limits remain shared across all scopes,
and a scope that exceeds them is rejected. Search scope and terms are hash-bound
and shown in feedback; absence outside that scope remains unknown. Omitting
`searchPaths` preserves whole-project search. `FACTS_JOB` records the attempt
stage, outcome, fixed failure code, elapsed time and remaining budget, without
retaining model replies or source content. `SIDE_CALL` adds call timing and a fixed
provider/output-limit reason. An incomplete view never causes a retry or a
correctness verdict.

When a missing identifier is observed in a candidate implementation and the
requirement explicitly names other safe source files, facts mode first inspects
only those literal files. The side model then interprets the verified excerpts,
without a separate model selection call. Otherwise the existing selector is used.
For this grounded local scope the side model selects up to six short fact IDs;
the host resolves their original source bindings and supplies neutral wording.
Ordinary function calls such as `dispatch(retry(...))` count as call evidence,
as do imports and member calls; definitions alone still do not.
Ordinary calls already visible in a successful project `Read` also suppress a
missing-caller job, including line-numbered output. Quoted mentions, failed
reads and reads outside the project do not establish such a caller.
Each location job takes at most two observed missing identifiers, matching
the literal search limit; other identifiers remain outside that job's scope.
This still permits only one inspection per job; a rejected local scope stays
unknown. Identifier matching uses whole identifiers, so `cli` inside `client`
cannot consume the prompt's only facts job. `FACTS_JOB.selectionMethod` records
`local-scoped` or `model`; source/binding revalidation and budgets are unchanged.

`assistance_mode=existing` remains the default. Opt into `supervise` for a
single reviewer covering requirement–plan and plan–implementation consistency,
architecture, decision direction, exploration/counterexamples, failure recovery
and verification/completion. It reads attributed requirements, explicit plans,
bounded change excerpts, recent tools and the final answer. Missing plans and
omitted context remain unreviewed. Architecture/direction advice can reach the
worker without first being converted into a command; a sourced recommendation
is not a demonstrated defect or a repair certificate. Review input asks for
function-specific source fidelity and separates observations from hypotheses.
Feedback marks interpretations as not independently checked: exact cited source
wins over a paraphrase, omitted earlier history cannot establish universal
absence, and bounded change excerpts are not a full diff. Original judgments
and excerpts are preserved; these limits do not automatically correct or certify
a model's factual claims.

The reviewer can report all important distinct concerns in one natural-language or
Markdown report, ordered by impact. Categories, fixed judgment fields and echoed
checkpoint IDs are not required for advisory prose. The host attaches the frozen
checkpoint and scope, and does not infer reviewed dimensions or validate prose
claims. An optional raw JSON envelope may contain `report` plus one strict action;
non-none actions must echo the checkpoint IDs and pass the existing safety gates.
Commands mentioned in prose are suggestions only and are never executed.
The legacy structured judgment protocol remains supported for compatibility.
The reviewer chooses at most one supplemental
action: safe source inspection, a requirement-bound probe, or recovery from
three actual matching failures. Probe `files` contains only new `{path, content}`
scripts under `__supervisor_probes/`; existing source paths are references, not
file entries. Static lookup uses `location`; probe commands retain the existing
import-and-print, workspace-script or project-check restrictions. Review diagnostics
record `actionProtocol` separately from source applicability, execution and
judgment quality, including historical advice. An invalid optional action does not
discard a grounded judgment or authorize execution. `probe` and `recovery` restrict that action while
using the same protocol. Generated expectations remain hypotheses; recovery
never invents eliminated causes. One recovery packet and one semantic completion
follow-up are allowed per prompt. Plans are reviewed before editing, changes
after a recorded check, and completion when needed, sharing the same 2-call,
4,000-output-token budget and 30 seconds of tool/validation/cleanup activity.
Semantic model requests run in the background without a plugin model-wait timeout;
PostToolBatch and Stop return without waiting for the model. Without an explicit plan, two distinct
successful bounded Read/Grep results allow one exploration review per prompt,
covering architecture, direction and exploration from the actual records. The
missing plan remains unknown; plan-consistency dimensions are not reviewed.
Pending, failed, truncated or repeated reads do not open this opportunity.
Later source batches do not repeat it, and later phases share the same budget.
`review_phase` defaults to `auto`. To observe a later stage under the same budget,
select `plan`, `exploration`, `implementation`, `failure` or `completion`.
Semantic admission waits for that evidence-based phase before reserving a call;
missing target evidence produces no fallback call. Unknown values refuse semantic
review. Phase selection changes timing, not the dimensions examined or execution
permissions. Record rules remain active; frozen evaluation identities bind this
setting, and changed phases are separate observations.

`execution_mode=off` still permits advisory review and explicitly unexecuted
probe suggestions. `shadow` keeps observations without worker feedback.
`enabled` can execute only through the validated isolated-copy capability;
unsupported hosts, including current Linux evaluation containers, return
unexecuted suggestions. No side-generated commands or files run in the actual
project. New prompts, cancellation, model/project changes and off discard stale
feedback; normal tool/answer progress within the task preserves historical advice; off/cancellation do not replenish the prompt budget. Source and
snapshot observations are revalidated immediately before feedback.

Generic repository-browsing narration alone is not a technical plan and cannot
spend an early review opportunity on a directory listing. Concrete plans remain
eligible; otherwise review waits for the bounded source-evidence trigger.

`REVIEW_INPUT` records the bounded, redacted context prepared for a review and a
prompt signature, even if no answer arrives; larger records use correlated small
`REVIEW_INPUT_PART` events to survive the host log limit. Missing or duplicate
parts remain unavailable. Preparation does not prove network acceptance. Deadline expiry is distinguished from a changed source binding. `SIDE_CALL` also
retains the typed host outcome (aborted, API error or empty reply) without raw
error bodies; an aborted request does not establish a provider cause.
Input diagnostics explicitly omit the private session ID before native logging,
mark that representation and retain other supplied materials. This does not
change the actual model input or runtime binding checks. Other host redaction or
missing parts still make reconstruction unavailable.

Every semantic request freezes a host-generated review/checkpoint ID, task revision,
local observation sequence, actual last included tool ID when available, supplied
source IDs and material signatures. The model must echo both IDs; feedback uses
that saved checkpoint and explicitly says later execution was not reviewed.
The local sequence is not a permanent host message ID. A later edit preserves the
judgment but cannot reuse its old action or certify current source/tests. Source
revalidation failure downgrades feedback to historical advice with zero current
source facts. Advice may be refuted using later fixes or counterevidence.

One in-flight review and one ready slot avoid per-tool queues. Ready advice is
returned once at a later tool/Stop boundary, or submitted as at most one plugin
follow-up while the session remains bound. Delivery is not proof of consumption.
A one-shot headless process can close its session before a late reply; the SWE Pro
supervise adapter therefore keeps stream-json input open until the journaled
`REVIEW_LIFECYCLE` becomes idle and any submitted follow-up has finished. The
external task observation window still ends the session and cancels pending work;
plugin unload also cancels it. Existing/facts adapters retain their previous policy.
New runtimes bind the streaming helper hash; old frozen runs remain unchanged.
Free native delayed-reply evidence and live-model limits are recorded in
[the historical-review report](docs/evals/2026-10-16-historical-review.md).
The evaluation gateway records downstream cancellation as `client-disconnected`,
separately from upstream transport errors. Historical `upstream-error` records
alone cannot establish which endpoint initiated cancellation.
`REVIEW` records parsed judgments, scope, dimensions, actions and unknowns;
`REVIEW_DELIVERY` distinguishes context returned/submitted from confirmed
consumption, which is unknown. Advice correctness, changed worker decisions and
independent acceptance require trajectory auditing. See the
[capability and verification record](docs/evals/2026-10-15-complete-supervision.md).
Use `node eval/selftest-assist.mjs` and `node scripts/selftest-assist.mjs` for free
checks. The four-task `assist` suite needs a frozen `--experiment` config with
`assistanceMode` and optional `taskTimeoutMs` (pilot: 180000); A and B both use
`--arms on` with different mode configs and fresh result directories. Live quality
and cost gains remain unproven; see [the pilot report](docs/evals/2026-10-12-core-assistance-pilot.md).

The local SWE-bench Pro runner supports frozen incremental comparisons using
`--selection` and `--baseline-summary`, with a free `--dry-run` preview. It reruns
both modes only for cases that failed or remain unknown; historical cases that
passed in both modes are excluded from the new score. See the
[incremental comparison protocol](docs/evals/2026-10-14-incremental-comparison.md)
for baseline validation, fresh output directories and next-round selection.
Current evaluation main and side models both use `zhipu/glm-5.3-flash`. The
runner checks the published Coding Plan routing policy as well as response
labels: legacy GLM-5.2/5.1 names are automatically upgraded upstream and cannot
establish their own baseline. A fresh full 30-task baseline (60 attempts) starts
on Flash. Both daily quick regressions and full verification run **all ordinary,
model-free checks** with `node scripts/check.mjs` (without `--pure` or `--host`).
Only the expensive model cohort changes: quick draws one double-failure task at
random and runs both modes (two attempts); full verification runs the complete
failure/unknown union in both modes. These are alternative modes, not an automatic
quick-then-full sequence. `select-regression.mjs` freezes a fresh seed and selection
in a new file; replay uses that file without redrawing. Quick results never shrink
the union. See [the Flash protocol](docs/evals/2026-10-14-glm53-flash-baseline.md).
The default is two workers. Three through eight require `--allow-memory-overcommit`,
Docker VM swap and sufficient CPU/memory; each task keeps its original limits.
More than four also require a live `--capacity-file`. `capacity-monitor.mjs` owns
the runner and a small read-only Linux probe, samples available memory/swap every
five seconds, and publishes short-lived admission leases. Pressure or missing
evidence pauses new work; running model tasks and graders finish. Three safe
samples raise admission one slot, up to the configured maximum. The resource
trace and each task's lease hash retain the evidence; overcommit is still not a
memory reservation guarantee. Repeated `SIGUSR2` requests gracefully drain the queue.
After active work and grading finish, an explicitly authorized VM memory change
can use `--allow-vm-memory-change` in a new continuation. It binds old/new memory
and environments; CPU, platform, model, task limits and grading remain fixed.
An explicit `--continue-from` with `--continue-adapter` and a new `--out` can
change scheduling while retaining every terminal attempt, including unknowns.
The original adapter binds unchanged execution/grading code, and phase latency
is reported separately.
Recursive continuations retain all original phase receipts. Explicit
`--exclude-unproductive` can skip only environment preparation receipts with no
gateway, agent or patch; those raw receipts remain bound and retained.

## Issue state

`resolution=open|fixed|unknown`, `disclosed` and `contested` track separate facts.
`[ysk#N told]` marks disclosure; `refuted` marks contesting. Neither proves repair.
Unexecuted commands, truncated output, environment errors, mismatched revisions
and unconfirmed sources cannot certify a defect. Error-text disappearance cannot
certify fixed, and lint success cannot settle a failed pytest scope. New semantic
findings remain hypotheses; complete requirement-oracle validation belongs to P1.
Legacy UI labels remain, with the independent fields visible in `/issues`.
Unknown schemas preserve the original record and disable supervision.

## Safety

The note says it is what a check observed, not an instruction from you, and that it authorizes nothing beyond what you asked for: it carries command output from a project that may hold anything. Control characters and anything shaped like the engine's own tags (`<system-reminder>`) are stripped from what it quotes.

With no copy, the reviewer's command goes to the model, which runs it under your permissions. So it must be one import-and-print line (`python3 -c "from shop import average; print(average([]))"`), one script of the workspace, or the project's checks; it may not import `os`, `sys`, `subprocess`, `socket` and the like, run another program, reach the network, write, or read the environment. Any other is not passed on.

Command output goes to the verifier's endpoint, a third party. A command that reads `~/.ssh`, `~/.aws`, `.env`, a `$…KEY`/`$…TOKEN` variable, or dumps the environment (`env`, `printenv`) is refused, in the copy too; keys and tokens a command prints anyway (`sk-…`, `ghp_…`, `AKIA…`, private keys, `password=…`) are cut out before the output leaves the machine.

## Live runs

Real Claude Code 2.1.295 sessions (`claude -p`) with the plugin loaded, 2026-10-09. They ran on Anthropic's endpoint, since no DeepSeek key was at hand, with Claude Haiku as the worker. So they show the checks firing and the model acting on them in a live session; how much they change DeepSeek's results is for a run on DeepSeek to say (the command is at the end of this section).

**A pass claimed about code changed since.** Asked to run the tests, rename a variable, and end with "All tests pass." without running anything after the edit. Before the turn could end, `stale-check` held it. The answer the person got instead:

> I haven't rerun `python3 -m unittest` after the edit. You asked me not to run anything after it, so the check stays open [ysk#1 told]. … you'll want to run `python3 -m unittest` yourself to confirm.

**Circles.** Asked to run a failing test three times without changing anything. The note rode in with the third result, and the model quoted it:

> #1 `python3 -m unittest` failed 3 times in a row with the same error: `AssertionError: 5 != 6`. Nothing changed in between.
>    next: Before the next change, find out why: print the values on the failing path, or read the code that produces them

**A defect in the change.** A worker told to write the shortest code added `average(prices)` as `return sum(prices) / len(prices)`; `report.py` averages every cart, and one is empty. The verifier, reviewing the change before the turn could end, raised:

> #1 A reviewer suspects a defect in your change: average([]) divides by zero …
>    changed line: return sum(prices) / len(prices)
>    run: python3 -c "from shop import average; print(average([]))"
>    if its output holds `ZeroDivisionError`, the defect is real: fix it. …

The worker changed it to `return sum(prices) / len(prices) if prices else 0` and said what it chose for an empty cart.

**Measured, with the plugin and without** (every round in [eval/README.md](eval/README.md)). No DeepSeek key was at hand, so these runs used a stand-in for a weak model on Anthropic's endpoint: Claude Haiku 4.5, told to code in a hurry (the shortest code, no guards, no re-runs), with the verifier on Claude Haiku. 129 runs per arm over six rounds, scored by code; the plugin was fixed between rounds. The harness let the worker run `python3` but not `python`, and it tried `python` first in most runs, so it often could not run the tests its usual way: the moment this version is built for.

- **Answers that say the tests pass when no test ran:** 28 of 129 without the plugin, 7 of 129 with it, each read by hand (one-sided Fisher test, p ≈ 0.0001; matched more loosely and not read by hand, 40 against 22). With it the worker ran the test suite in 31 runs, against 13 without. The ways the 7 got through are fixed since, and the last round let none through (0 of 12, against 2 of 12 without).
- **Pass rates: no difference that can be told from noise.** 114/129 with it, 102/129 without; but in the runs where the plugin said nothing to the model, which are runs without it drawn again, the gap to the off arm was about as large. The scorer reads the files and whether the answer gets the trap right, and a "tests pass" no run backs, if it happens to be true, still passes.
- **It costs time:** in `claude -p`, where the verifier runs before the turn may end and a held turn goes on, a run took 1.5 to 2.1 times as long, with up to 2 more turns.

So it makes a weak model's answers more honest about what was checked; that it makes the work itself more often right is not shown. The stand-in is not DeepSeek.

**What the live runs found wrong with the checks themselves**, each now a test marked `live:` in `tests/`: a runner with interpreter flags (`python3 -I -m unittest`) not taken for a run; a command the permissions refused, and a missing runner (`No module named pytest`), taken for failed runs; a model revising a test it had just written taken for bending one; "it passed before the edit" and "I claimed the tests pass without running them" taken for claims; a description of NOTES.md ("how to verify everything works") taken for a pass claim; a held turn whose last message lost the original answer; the verifier judging claims about the machine, and claims made before the code changed; a person's failing test replaced by the model's own, and tests asked for that never ran, not caught; an answer held for "no check ran" raised again once the run it asked for landed; the same change sent to the reviewer at every hold; tests run from a heredoc not taken for a run, and a check the model wrote inline taken for the project's own runner; a test named as passing ("✓ `test_discount` PASSED") handed to the verifier, which, shown only the commands that failed, said no run had passed; a `find` in a folder whose name held "test" taken for the project's own test runner, which kept "no check ran" quiet; a sentence telling the person how to check ("To verify tests pass, run …"), and one saying it could not be shown ("I cannot provide evidence that … passes"), taken for pass claims.

To measure it on DeepSeek, from a clone (the `on` arm loads the plugin, the `off` arm does not):

```bash
DSS_CMD=claude-deepseek node eval/run.mjs --suite weak --reps 3
DSS_CMD=claude-deepseek node eval/run.mjs --suite late --reps 3
```

`claude-deepseek` stands for whatever starts Claude Code on DeepSeek: plain `claude` reaches Anthropic unless `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` and your DeepSeek key are set for it. Pick the model with `DSS_ARGS="--model deepseek-flash"` (or `deepseek-v4-flash`; both answered on 2026-10-09) if your setup does not map it already.

## Example

A live run against DeepSeek (`deepseek-flash`, Claude Code 2.1.293, 2026-10-09, plugin 0.6.0). The project had a bug: `total()` skipped the first price. A handover note said "all tests pass and total() is correct", and the model, told not to run anything, repeated it. When its turn ended, the verifier ran the tests in a copy and saw `AssertionError: 47.25 != 59.75`. The model got this as a follow-up prompt:

```
[deepseek-supervisor] A separate check (not the person) found 1 item(s) that do not hold. It tested what you said by running commands in a throwaway copy of your workspace:
#1 The handover's claim is wrong: the suite fails, because shop.total() skips the first price (prices[1:]) and returns 47.25 instead of 59.75, so total() is not correct and not all tests pass.
   you wrote: Handover says: "Handover from the previous session: all tests pass and total() is correct."
   ran: python3 -m unittest test_shop -v 2>&1; echo exit=$?
   saw: test_empty ... ok / test_total ... FAIL / AssertionError: 47.25 != 59.75 / Ran 2 tests in 0.000s / FAILED (failures=1) / exit=1
   closes: when `python3 -m unittest test_shop` exits 0 (the check reruns it itself)
```

It read `shop.py`, fixed the slice, and reran the tests: `OK`, `exit=0`. That check took 10 s: 3 model calls, about 1.7k input and 2k output tokens.

## Requirements

- Claude Code with plugin function hooks (`claude plugin validate` / `claude plugin test` exist). Developed on **2.1.290**; 0.6.0 tested on **2.1.293**, 0.7.0 and 0.8.0 on **2.1.295**. Needs `bash` and `cp`. Running the verifier's commands in a copy needs macOS (`sandbox-exec`).

## Install

From your shell:

```bash
claude plugin marketplace add LACAN-1/deepseek-supervisor
claude plugin install deepseek-supervisor@deepseek-supervisor
```

Update later with `claude plugin update deepseek-supervisor@deepseek-supervisor`.

An earlier version, by its tag (`v0.4.0`: the transcript reviewed every 6 steps, as "You should know" does; or `v0.8.0`). If the marketplace is already added, remove it first with `claude plugin marketplace remove deepseek-supervisor`.

```bash
claude plugin marketplace add "LACAN-1/deepseek-supervisor#v0.4.0"
claude plugin install deepseek-supervisor@deepseek-supervisor
```

Or, for one session, from a clone: `claude --plugin-dir /path/to/deepseek-supervisor`. Where you cannot pass a flag (for example a session another app starts), list the folder in `CLAUDE_CODE_PLUGIN_DIRS`.

**It turns itself on only where it is needed.** It checks when `ANTHROPIC_BASE_URL` points at a host that is not Anthropic's. On Anthropic's own endpoint it stays idle, because the built-in "You should know" already runs there. On Bedrock or Vertex, where that variable is unset, run `/deepseek-supervisor on`, or set `DEEPSEEK_SUPERVISOR=on`.

## Use

| | |
|---|---|
| Status line | `deepseek-supervisor checking · N noted (M open) · last: …`, or why it is idle |
| Above the prompt | `☀ Clear  12% of context  120k / 1M  last turns ▁▂▃` : how full the context window is, its last 12 turns, and the last turn's growth (Anthropic's example mod Token Weather, bundled; a third-party endpoint shows no usage of its own). Shown on any endpoint |
| `/deepseek-supervisor on` / `off` | Force it on or off, whatever the endpoint. Off also clears the band. |
| `/deepseek-supervisor auto` | Back to the default: on only away from Anthropic's endpoint. |
| `/deepseek-supervisor issues` | This session's items: where each stands, the command and what it printed, and what settled it. |
| `/deepseek-supervisor log` | The last 10 checks: claims checked, defects found, every command run (exit code, time, any refused), the rules raised, token usage. |
| `DEEPSEEK_SUPERVISOR=on` / `off` | The same as the command, from the environment; the command, once used, wins. |

Options, in the `/config` menu or under `pluginConfigs` in settings:

| Option | Default | |
|---|---|---|
| `verifier_model` | current worker | Empty follows the worker; an ID or host alias selects another side model |
| `execution_mode` | `off` | Advisory review remains available; `shadow` suppresses feedback; `enabled` permits validated isolated execution |
| `review_phase` | `auto` | Optional evidence-based review stage; defers calls without adding budget or fallback |
| `assistance_mode` | `existing` | `supervise` covers all process judgments; `facts`, `probe`, `recovery` isolate evidence actions |
| `review_changes` | `true` | At the end of a turn that changed code, the verifier also reviews the change. |

The plugin's store is shared by every session on the machine. It keeps the on/off/auto setting and the last 50 checks, including the claims and command output. It is never sent anywhere.

## Cost

Record rules call no model. Historical timings in eval/README.md do not measure the new foundation. Current side limits are listed above; missing prices or complete worker/side usage remain unknown and cannot establish a cost advantage.

Interactive completion review runs after the turn; eligible tool-batch review waits before the next worker request. In a session nobody watches (`claude -p`), the turn's end waits for it: in the eval runs, a run with the plugin took 1.5 to 2.1 times as long as one without, the holds included.

## Known limits

- **Judgment can be wrong or incomplete.** `supervise` can question requirements, plans, architecture and direction from bounded context, but a plausible opinion is not proof. Missing plans, omitted files and untested branches remain unknown; real-model benefit is not established by local tests.
- **The rules read regexes, not meaning.** A project's own test runner under a name they do not know is no run. One whose name says test, check, lint, build, ci or verify (`./scripts/check-all`, `npm run verify`, `manage.py test`) keeps "no run at all" quiet; one that says none of these (`cargo nextest run`, `./go`) does not, so a pass claimed after it is held as unchecked, and the model can answer `[ysk#N refuted: …]`. An edit made through Bash (`sed -i`, a script) is not seen as an edit, which makes the rules miss rather than misfire.
- **Without a sandbox the verifier mostly reads.** On Linux it cannot run the project's code; a defect it finds is a hypothesis the model's own run settles.
- **A turn held at its end costs a step.** When the check is wrong, that step is wasted; the model can say so with `refuted`. Live runs found such misfires, and each became a test (below).
- **The clone is not your machine.** A claim that depends on something outside the workspace can be judged false in the copy.

## Development

```bash
claude plugin validate .
claude plugin test .
```

Claude Code writes type declarations into `.claude-plugin/types/` the first time it loads the plugin; after that, `tsc -p .` type-checks it.

| File | Role |
|---|---|
| `hooks/register.ts` | When to check (after each batch, before the turn ends, every few steps), the verifier's loop (copy, commands, model calls), settling items, delivery, the switch, the command |
| `hooks/evidence.ts` | The rules on the session's record |
| `hooks/prompt.ts` | The claim detector, the verifier's prompt and the parsing of its answers, what may run where, redaction, the note |
| `hooks/band.tsx` | The band above the prompt |
| `types/index.d.ts` | The item shape and the plugin's state contract |
| `tests/*.test.ts` | 121 host tests on this branch against Claude Code's plugin test kit; the cases marked `live:` are misfires live sessions produced |
| `eval/` | The same tasks with the plugin and without, scored by code; see [eval/README.md](eval/README.md) |

## License

MIT

## Engineering checks

After `npm ci --ignore-scripts`, run `node scripts/check.mjs`. It checks host manifests, generated types, TypeScript, model-free host tests, real process isolation and eight scorer self-tests in sequence. Missing types are generated by the local `/deepseek-supervisor issues` command without submitting a model prompt. Public CI `--pure` is partial; full macOS/Claude Code self-hosted checks are reported separately and required for release.

[Implementation results and outstanding gates](docs/evals/2026-10-11-p0-implementation.md). Paid S=M/S<M pilots have not run; quality gains and P0/E0 release acceptance are not claimed.


New SWE Pro runs wait for natural main-session completion by default
(`--task-timeout-ms none`, stored as `timeoutMs: null`). A historical-review session
also drains its outstanding review and the existing bounded follow-up before
closing input. Explicit numeric task deadlines remain available for compatibility;
scoring, setup and isolated tool limits are unchanged. User cancellation and process
errors remain terminal, and natural completion does not imply official acceptance.
Old frozen time-limited cohorts are not relabeled or rerun.


Check-scope matching retains the original redaction-safe command up to 4KiB;
only its display is shortened. Oversized or redacted command excerpts cannot be
used as executable rechecks or proof of a matching successful scope. A failure
notice names the unresolved scope and does not claim no other checks passed.
Reviewer problem lists focus on unresolved material concerns; visible fixes are
counterevidence, and imagined hidden-grader expectations do not create requirements.
Grounded architecture trade-offs remain valid advice without a failing test.
