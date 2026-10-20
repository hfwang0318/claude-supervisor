# Linux support and reviewer optimization results (2026-10-20)

## Linux support

- Probe isolation backends:
  - macOS `sandbox-exec`;
  - Linux `bubblewrap` with explicit read-only system binds, writable owned copy, `--unshare-all`;
  - opt-in Docker/Podman fallback (`CODE_SUPERVISOR_SANDBOX=container`, local image only);
  - read-only fallback when isolation is unavailable.
- `scripts/linux-preflight.mjs` reports bwrap/userns/setuid/container availability.
- `scripts/linux-selftest.mjs` runs a real capture/execute isolation probe.
- Linux verification performed in Debian bookworm Node 22 containers:
  - `claude plugin test`: 358 tests pass with npm Claude Code 2.1.295;
  - bwrap selftest: `boxed`, `/home` and `/root/.ssh` hidden;
  - non-root bwrap selftest: `boxed`;
  - no-namespace fallback: `read-only`;
  - Docker fallback: container backend executed a probe successfully;
  - Linux `probe-run`: candidate fail / correct control pass;
  - Linux verified-finding pipeline: 3 verified, 0 invalid;
  - Linux gate: silent mutant blocked (3 verified), correct patch passed (0 verified);
  - Linux repair A/B at 240s: reviewed passed 3/3 (110s), generic failed 0/3 (248s).

Limits: no native Linux host run; nested-container results; Docker fallback is opt-in and privileged; `/etc` is mounted read-only but not secret-free.

## Reviewer optimization

- Three constructed silent mutants across cba6ebb (TS), ansible 5260527 (Python), flipt f36bd61 (Go).
- 60s repair A/B: reviewed **18/19 (95%, 75–99%)**, generic **0/15 (0%, 0–20%)**.
- Review gate: 3/3 silent mutants blocked, 0/5 correct patches falsely blocked.
- Correct-patch findings: 38 raw findings, **0 verified**.
- Key finding: the actionable input is the concrete `current → required` value; file:line is a speed aid, not a correctness requirement.
- Product probe protocol now carries optional `location`, `current`, `required`.
- Prompt rules added for contract probes, repository command shape, invalid-oracle prerequisites, exact finding-to-probe, and concrete current/required values.

Limits: same verified finding reused; constructed mutants, not natural failures; probe compiler still produces invalid-control probes; one-shot `claude -p` cannot measure turn-end reviewer because side calls time out/abort at 30s.

## Reproduce

```sh
node scripts/linux-preflight.mjs
node scripts/linux-selftest.mjs
claude plugin test .
node scripts/check.mjs
```

Local experiment artifacts remain under `.superpowers/sdd/phase0-rebuild/` and are not committed (1.4 GiB).

## Multi-turn side-call evidence

A persistent stream-json session (`claude -p --input-format stream-json --output-format stream-json --verbose`) with a real code change and a completion claim produced an **answered** reviewer side call: 21,773 ms, 901 input / 1,224 output tokens. A follow-up side call also answered (11,153 ms, 782 / 566 tokens) when the session stayed alive.

The same plugin under one-shot `claude -p` produced `provider-unanswered` / `aborted` with 0 tokens. The 30s model limit is therefore not the root cause; the one-shot turn-end lifecycle aborts the side call. Product reviewer measurements must use a persistent/interactive session.

## Natural partial patch gate (test-only cba)

A partial patch was made by keeping only the test-file hunk of the passing cba agent patch. Official grade: failed, 2/3 required tests.

Reviewer produced 4 missing-source findings. With a deterministic fallback for test-only patches (`git diff --name-only | grep -q '<source file>'`):

| Candidate | Findings | Verified | Invalid |
|---|---:|---:|---:|
| test-only partial | 4 | **4 contract** | **0** |
| correct patch | 4 | **0** | **0** |

Gate: partial blocked, correct patch passed. Reviewer recall 4/4; verifier precision 4/4 on this sample.

Caveat: the partial is a truncated real agent patch, not a fully natural failure; sample size is one task. The fallback is specific to "test-only patch, source missing" and does not generalize to arbitrary hidden-contract bugs.

## Natural partial repair A/B

Test-only cba partial (official 2/3 fail):

| Arm | Budget | Result | Patch |
|---|---:|---|---:|
| reviewed | 240s | **passed 3/3** | 6,915 B |
| generic | 240s | failed 2/3 | 4,347 B |

At 120s both arms timed out with the unchanged 4,347 B test-only patch. The reviewed 240s arm added the missing production source change. First natural-ish partial fail→pass differential, one task only.

## Second test-only partial: Flipt (Go)

Flipt passing patch with the source hunk removed (fixture + test only). Official verifier reports 0/2 required tests passed (grade wrapper classified environment-error, but verifier log shows FAILED and reward 0).

Reviewer produced 4 missing-source findings. Verification:

| Candidate | Findings | Verified | Invalid |
|---|---:|---:|---:|
| test-only partial | 4 | **4 contract** | **0** |
| correct patch | 4 | **0** | 0 |

After fixing Go `_test.go` detection and forcing the control source file for test-only patches, Flipt also reaches 4/4 verified with 0 invalid. Across cba and Flipt: 8/8 verified, 0 invalid, 0 false positives on the correct patch.

## Flipt repair A/B (negative)

Flipt test-only partial, official 0/2:

| Arm | Budget | Result | Patch |
|---|---:|---|---:|
| reviewed | 240s | failed 0/2 | 2,527 B, fixture/test only |
| generic | 240s | failed 0/2 | 2,527 B, fixture/test only |
| reviewed | 400s | failed 0/2 | 3,943 B, added `scratch_test.go`, still no source |

A strip-test-only strategy (start from base without the test/fixture hunks) produced an empty patch and patch-error at 400s. Reverted.

So the reviewer finding and 4/4 verified gate work on Flipt, but the repair model does not convert the Go finding into a production source change. This is a repair-policy/model limitation, not a verifier-recall failure.

## Flipt hard-prompt repair retry

Strengthened the reviewed prompt: test-only/fixture-only edits are a failed repair; the finding's production file is named and the first Edit must be there.

| Budget | Source changed | Result | Patch |
|---:|---|---|---:|
| 400s | yes (`validate.go`) | failed 1/2 | 4,524 B |
| 600s | no (added `scratch_pos_test.go`) | failed 0/2 | 3,742 B |

The hard prompt is not deterministic: 400s produced a partial source implementation; 600s regressed to test-only again. Flipt repair remains unreliable, unlike cba. This is a repair-model/policy issue, not a verifier failure.

## Flipt two-stage repair: pass

Added a reviewed-only second pass: after capturing the first patch, if it touches only tests/fixtures, continue the **same session** with `--continue` and an explicit instruction to edit the production source; do not edit tests.

| Arm | Budget | Result | Patch | Second pass |
|---|---:|---|---:|---|
| reviewed | 240s | **passed 2/2** | 4,330 B | yes |
| generic | 240s | failed 0/2 | 2,527 B | no |

The first reviewed patch was test/fixture-only; the continued session then changed `internal/cue/validate.go` and passed both hidden tests. This closes the Flipt repair gap without weakening the verifier.

Across the two natural test-only partials:

| Repo | reviewed | generic |
|---|---|---|
| cba (TS) | pass 3/3 | fail 2/3 |
| Flipt (Go) | pass 2/2 (second pass) | fail 0/2 |

Caveat: one sample per repo, 240s in a nested/emulated environment, and the second pass adds latency. The two-pass policy is an eval/repair harness result, not yet a live plugin behavior.

## Hidden-contract sample: cba silent mutant

The cba silent mutant changes `haveLegacyName` handling while visible tests stay green; official grade is 0/3.

Linux evidence already collected:

| Stage | Result |
|---|---|
| reviewer findings | 6 |
| verified | **3 regression** |
| invalid-control | 0 |
| correct patch | 0 verified |
| gate | silent blocked, correct passed |
| repair reviewed 240s | **passed 3/3** |
| repair generic 240s | **failed 2/3** |

Unlike the test-only samples, this is a real source-contract defect: candidate fails, correct control passes, base passes. It is still a constructed silent mutant, not a fully natural agent failure.

Combined sample picture:

| Sample | Type | Reviewer | Verified | Gate | Reviewed repair | Generic repair |
|---|---|---|---:|---|---:|---:|
| cba silent | hidden source contract | 6 findings | 3/3 | block/pass | 3/3 | 2/3 fail |
| cba test-only | missing source | 4/4 | 4/4 | block/pass | 3/3 | 2/3 fail |
| Flipt test-only | missing source | 4/4 | 4/4 | block/pass | 2/2 | 0/2 fail |

Limits: two repositories, three samples, constructed/truncated; no live plugin side-call delivery.

## Second hidden-contract sample: Flipt `Location.File`

Flipt silent mutant clears `Location.File`; visible tests stay green, official grade 1/2.

| Stage | Result |
|---|---|
| reviewer findings | 2 |
| verified | **1 regression** |
| invalid-control | 0 |
| correct patch | 0 verified (1 invalid) |
| gate | silent blocked, correct passed |

The verified probe was exact:

```sh
if grep -q 'File:   ""' internal/cue/validate.go; then exit 1; else exit 0; fi
```

This adds a second hidden-contract sample in a second language. Correct-patch run still had one invalid probe, so false-positive risk is not zero, but no verified false positive.

Sample count: 2 hidden-contract + 2 test-only, across TS and Go.

## Four-sample aggregate

| Sample | Type | Reviewer findings | Verified | Gate | Reviewed repair | Generic repair |
|---|---|---:|---:|---|---:|---:|
| cba silent | hidden contract (TS) | 6 | 3 | block/pass | pass 3/3 | fail 2/3 |
| Flipt silent | hidden contract (Go) | 2 | 1 | block/pass | pass 2/2 | fail 1/2 |
| cba test-only | missing source (TS) | 4 | 4 | block/pass | pass 3/3 | fail 2/3 |
| Flipt test-only | missing source (Go) | 4 | 4 | block/pass | pass 2/2 (two-pass) | fail 0/2 |

- Gate: 4/4 partials blocked, 4/4 correct patches passed, 0 verified false positives.
- Reviewed repair: 4/4 samples passed.
- Generic repair: 0/4 samples passed.
- Wilson 95% interval for 4/4 reviewed: approximately 0.51–1.00; for 0/4 generic: 0.00–0.49.

Caveats:

- findings are not independent; each sample has one root cause;
- cba/Flipt silent mutants are constructed; test-only partials are truncated real patches;
- repair budgets differ (60s for the original Flipt/cba silent runs, 240s for the Linux/test-only runs);
- no live plugin side-call delivery was measured.

## Side-call delivery finally observed

Two configuration prerequisites were missing:

1. default `assistance_mode=existing` is record-rules only; semantic review requires `supervise`/`probe`/`recovery`;
2. the worker model `zhipu/glm-5.3[1m]` has no `reviewCompletionProfile` on host 2.1.295, so the reviewer skipped with `SIDE_BUDGET {"reason":"unverified-output-cap"}` before making a call.

With `assistance_mode=supervise` and `verifier_model=zhipu/glm-5.3-flash`, a persistent session produced:

- `SIDE_CALL` answered in 10.5s, input 2,509 / output 576;
- `REVIEW_QUEUED`;
- `REVIEW_DELIVERY` with `"delivery":"submitted"`.

This is the first end-to-end note submission observed. Consumption by the next main request is still unverified. In this sample the reviewer reported no concern, so it also missed the hidden field-stripping bug; delivery works, judgment is not guaranteed.

`/code-supervisor health` now reports `model.outputProfile`, `model.hostVersion`, and `warnings: ["side-model-output-cap-unverified"]` when semantic review is enabled but the selected model has no transport profile.

## Note consumption verified

With `assistance_mode=supervise` and `verifier_model=zhipu/glm-5.3-flash`, a persistent two-turn session produced:

- side call 1 answered in 25.8s (input 2,259 / output 857);
- `REVIEW_QUEUED` → `REVIEW_DELIVERY` `"delivery":"submitted"`;
- second side call answered in 35.4s;
- the next main-model answer explicitly discussed the reviewer checkpoint and its `Concern 2/3`, proving the note entered the next main request.

The main model also refused the false sum claim, so this run proves delivery/consumption, not reviewer judgment quality. The previous sample with the same prompt shape showed the reviewer can still miss a hidden field bug.

This closes the side-call loop for a persistent session when the side model has a supported transport profile. One-shot `claude -p` still ends before the side call can complete.

## Live cba task with supervise + flash

Ran the real cba silent-mutant task in a Linux container with `supervise` and `verifier_model=zhipu/glm-5.3-flash`, persistent stream-json, 900s keepalive.

Review activity:

- side call 1 answered in 77.6s (8,359 input / 2,436 output);
- `REVIEW_QUEUED` → `REVIEW_DELIVERY` **context-returned**;
- side call 2 answered in 76.2s (9,215 / 2,365);
- side call 3 answered in 56.5s (9,068 / 1,906);
- two review deliveries returned to context.

After review, the main model explicitly reasoned:

> Remove the `haveLegacyName: undefined` noise → `setState(devices)` after resolving names.

That line is exactly the hidden mutant defect. The task ended on `end_turn`; no official grade was captured because the container was removed. This is the first live real-task evidence that the reviewer note reached the main model and changed its plan.

Caveat: one task, no grade, and the main model may have found the same line independently. It establishes live delivery/influence, not a measured fail→pass.
