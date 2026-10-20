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
