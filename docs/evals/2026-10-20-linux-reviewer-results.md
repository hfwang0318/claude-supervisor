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
