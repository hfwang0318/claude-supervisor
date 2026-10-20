# Expanded failure set from passing patches (2026-10-21)

## Method

From the 30 passing SWE-bench Pro agent patches, keep only the test/fixture hunks and drop the production-source hunks. Grade the resulting patch with the official verifier.

This is a real near-failure class: the agent changed tests but not the implementation.

## Yield

- 10 test-only partials generated;
- 9 official failures (`failed`, reward 0);
- 1 environment-error (navidrome, verifier did not produce a valid reward).

Tasks included element-web, openlibrary, webclients, tutanota, ansible, navidrome. All use already-materialized Linux/amd64 images; no new image pull.

## Reviewer / gate on three new samples

Three diverse cases were reviewed and verified:

| Task | Language | Reviewer findings | Verified | Invalid | Ungrounded | Correct patch |
|---|---|---:|---:|---:|---:|---:|
| ansible-d624 | Python | 6 | **6** | 0 | 0 | 0 verified |
| element-web-ecfd | TypeScript | 4 | **4** | 0 | 0 | 0 verified |
| openlibrary-b671 | Python | 10 | **10** | 0 | 0 | 0 verified |
| **total** | | **20** | **20** | **0** | **0** | **0 verified** |

Correct-patch runs had 0 false positives; two invalid probes (one ansible, one openlibrary).

## Fixes driven by the new set

1. `test/` directory paths were not classified as tests, so the test-only fallback did not trigger; added `(^|/)tests?/`.
2. The missing-source probe cites the control source file, which is absent from the candidate patch; grounding now checks `git diff --name-only` literals against the control patch, not the candidate.

Before the fixes: element 1/4 verified, 2 invalid, 1 refuted. After: 4/4 verified, 0 invalid.

## Limits

- One failure class (test-only / missing source), one partial per task.
- Environment-error case not counted as failure.
- No repair A/B yet on the new 10-task set.
- Findings per task share one root cause; 20 findings are not 20 independent defects.

## Remaining four reviewed samples

| Task | Reviewer findings | Verified | Invalid | Correct patch |
|---|---:|---:|---:|---:|
| tutanota-f3ffe17 | 7 | **7** | 0 | 0 verified |
| ansible-42355d | 8 | **8** | 0 | 0 verified |
| element-web-4fec | 5 | **5** | 0 | 0 verified |
| openlibrary-f3b26 | 6 | **6** | 0 | 0 verified |

Combined with the first three samples:

- **7 new tasks reviewed** (cba test-only is an eighth known sample);
- **46 reviewer findings**;
- **46 verified** on partial patches;
- **0 invalid**, **0 ungrounded**;
- **0 verified false positives** on the 46 correct-patch probes (2 invalid probes remain in the first three correct runs).

Not reviewed: navidrome (environment-error) and one element sample whose review file collided on a truncated filename; cba is already covered.

Limits remain: all new samples are test-only/missing-source partials, one per task, and findings share a root cause per task.

## Repair A/B on ansible-d624

| Arm | Budget | Result | Patch | Second pass |
|---|---:|---|---:|---|
| reviewed | 240s | **passed 129/114** | 4,638 B | yes |
| generic | 240s | failed | 2,778 B | no |

The first reviewed patch still changed only `test/.../test_human_to_bytes.py`; the repair harness did not recognize `test/` as a test path, so the two-pass retry did not run. After adding `(^|/)tests?/` detection, the same session retry edited the production formatter and the official verifier passed.

This is a new fail→pass on the expanded test-only set, driven by a case-derived fix.

## Source-drop failure class

To move beyond test-only partials, kept the tests and most production changes but dropped one production-source hunk from passing patches.

Yield from six candidates:

- 5 official failures (NodeBB, element, navidrome, tutanota, openlibrary);
- 1 still passed (ansible-42355);
- 1 environment-error (openlibrary-b671).

Three reviewed samples:

| Task | Findings | Verified | Refuted | Invalid | Correct patch |
|---|---:|---:|---:|---:|---:|
| NodeBB-7b8bff | 5 | **5** | 0 | 0 | 0 verified |
| element-web-ecfd | 3 | **3** | 0 | 0 | 0 verified |
| navidrome-ee21 | 3 | **3** | 0 | 0 | 0 verified |
| **total** | **11** | **11** | **0** | **0** | **0 verified** |

Correct-patch runs had 0 verified false positives and 0 invalid probes. One navidrome probe was skipped as expensive.

Fixes driven by this class:

1. missing-source phrases now include "no diff hunk touches", "never changed", "not modified/updated";
2. for such findings, prefer a control source file that is **absent from the candidate patch**, rather than the first source file named in prose.

NodeBB improved from 0/5 verified and 1 ungrounded to 2/5 verified and 0 ungrounded.

A final fix forced the absent-source probe whenever the control patch contains a production source file absent from the candidate. Verified recall rose from 5/11 to **11/11**, with 0 invalid and 0 ungrounded. No repair A/B yet on source-drop samples.
