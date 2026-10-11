# P0 implementation checkpoint — 2026-10-11

Scope: section 7's first delivery, starting with Task 1 and the 2A/2B/2C foundation.
This is implementation progress, not G0a/G0b/E0 acceptance or a release.

Implemented:

- Functional acceptance, honest reporting, constraints and environment metrics;
  missing or conflicting per-call usage/prices remain unknown. Eight independent
  Node engineering fixtures with hidden evaluators outside agent workspaces.
- Shared pure contracts, session coordinator, explicit S<=M configuration and no
  stronger fallback. Prompt budget, stale-result rejection and delivery dedup.
- Opt-in snapshot/execution service, real SHA-256 manifests, actual dirty/untracked
  files, deny-default macOS sandbox, explicit environment, stream output cap,
  process-group timeout and ownership-checked cleanup. Shadow suppresses feedback.
- Observations bound to command/output/revision, hypotheses separated from facts,
  unrelated checks cannot settle failures, disclosure/contesting separate from
  resolution. Legacy state migration and unknown-schema preservation.
- Unified model-free checks, pinned TypeScript/lockfile, partial public CI and
  opt-in full supported-host CI. English/Chinese documentation updated.

Current automated evidence: `node scripts/check.mjs` passes manifests, TypeScript,
114 host tests, the real workspace/process self-test and all eight scorer
self-tests. Baseline had 91 host tests. These test counts measure software
behavior, not model quality. No paid model calls or model-quality pilot ran.

Outstanding gates and work:

- G0a/G0b: concrete versioned model/reasoning profiles and paid S=M/S<M pilot;
  60-task development pilot and separately frozen confirmation corpus. Eight
  fixtures cannot substitute for those experiments.
- E0: complete host-VM process cancellation/orphan recovery, bounded session-wide
  retention/replay, durable delivery recovery, pending-intent lifecycle, failure
  fixtures and main-agent filesystem revision coverage beyond tool observations.
- Frozen eval launching/context isolation and complete per-call main/side usage
  capture need end-to-end validation before cost or causal quality claims. Old
  trap pass remains separate from unknown independent functional acceptance.
- P1's sourced oracle and real probe feedback remain gated on G0b/E0; P2–P5 are
  not implemented. Defaults enable neither independent execution nor a side model.

Decisions: public declarations moved to the self-contained manifest type file
because the host rejects imports there; unsupported execution fails closed;
legacy semantic feedback stays advisory until its oracle can be independently
validated. The original user's main checkout and untracked documents are preserved.


Independent whole-branch review identified five consequential bugs, all reproduced
with failing tests and fixed: missing-scope fallback after compaction, unrelated
failure blocking a true lint result, unauthenticated existing-test labels, negated
failure language credited as honest, and bare mode disabling the on arm. Oracle
promotion now additionally requires host-authenticated command/source/scope/revision
metadata; no production oracle adapter is enabled. One author-found disclosure
lifecycle case was also fixed: matching later evidence can repair an already
reported issue without discarding its disclosure flag. The complete check after
these fixes passes 114 host tests, real process/files and eight model-free self-tests.
