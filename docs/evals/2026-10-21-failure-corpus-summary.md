# Failure corpus summary (2026-10-21)

## Corpus

| Class | Tasks | Findings | Verified | Invalid | Correct-patch verified FP |
|---|---:|---:|---:|---:|---:|
| test-only / missing source | 10 generated, 7 reviewed | 46 | 46 | 0 | 0 |
| source-drop | 6 | 15 | 15 | 0 | 0 |
| semantic condition mutant | 6 | 7 | 6 | 0 | 0 |
| multi-condition mutant | 4 | 10 | 7 conditions | 0 | 0 |

Failure cases: 10 test-only partials, 5 source-drop failures, 6 semantic failures, 4 multi-condition failures.

Correct-patch gates were run on every class; no verified false positives. Some probes were out-of-scope rather than verified.

## Reviewer / probe lessons

- Missing-source fallback (`git diff --name-only`) is strong for test-only and source-drop.
- Deterministic probes must reject prose `required` fields and code-like `required` absent from the control patch.
- Patch-diff and region probes improve semantic recall; `sed` line-only probes are unstable.
- Reviewer sampling variance is real: webclients semantic was 0 findings on first sample and verified on retry.
- Two-sample consensus removes noise but can drop a task; empty-consensus fallback uses max patch-match score.

## Repair results

| Sample | reviewed | generic | Note |
|---|---|---|---|
| ansible test-only | pass 129/114 | fail | reviewed-only |
| cba test-only | pass 3/3 | fail 2/3 | reviewed-only |
| Flipt test-only | pass 2/2 (two-pass) | fail 0/2 | reviewed-only |
| navidrome source-drop | — | pass 15/15 | generic also solves |
| NodeBB source-drop | fail 2/12 (240s/600s) | not run | unresolved |
| ansible semantic | pass 49s | pass 247s | speed only |
| tutanota semantic | pass | pass | no difference |
| vuls semantic | pass | pass | no difference |
| openlibrary semantic | pass | pass | no difference |
| element semantic | pass | pass | no difference |
| **webclients semantic** | **pass 4/4** | **fail 3/4** | **reviewer-only, reproduced 2×** |

## Limitations

- Small samples; findings per task share a root cause.
- Failure classes are generated/truncated from passing patches, not fully natural failures.
- Semantic task-level coverage is good but condition-level recall is 7/10 and multi-condition full recall is 3/4.
- Reviewer-only repair gain is one task, reproduced twice.
- Live plugin side-call/note delivery was tested earlier; one-shot `claude -p` remains unusable for turn-end review.

## Artifacts

- `.superpowers/sdd/phase0-rebuild/expanded/` (cases, reviews, verify results)
- `docs/evals/2026-10-21-expanded-partial-set.md` (detailed log)
- 360 plugin tests pass at the time of this summary.
