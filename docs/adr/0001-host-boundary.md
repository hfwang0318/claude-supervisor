# Host boundary

Status: implemented foundation, 2026-10-11.

Claude Code 2.1.295 exposes session.id/model, cancellable model.complete, streaming
process.spawn and CAS state updates. Session transcript messages have no stable
message ID; transcript position is not treated as a requirement oracle.

The manifest's types contract must be self-contained: imports are rejected by
`claude plugin validate`. Shared public declarations therefore live once in
`types/index.d.ts`; `supervisor/contracts.ts` re-exports those types. Pure core
imports no host runtime. `hooks/host.ts` accepts value/function ports because the
host scanner disallows passing `$` across module boundaries.

`claude --plugin-dir . --setting-sources '' -p '/deepseek-supervisor issues'`
initializes types using a local command, without submitting a model prompt.
Bare mode was observed skipping function hooks and is not used for host checks.
Generated `.claude-plugin/types` is ignored. TypeScript 5.9.3 is pinned with a lock.

`update` uses ifVersion and retries CAS misses. Local tests also exposed host test
exit status 0 with failed cases; `scripts/check.mjs` checks the failure summary.
Public CI runs pure/scorer checks. Full host/process results are separate and
needed for release. Wider host/platform support is not inferred from those jobs.
