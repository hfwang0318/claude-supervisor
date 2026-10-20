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

## Source-drop repair A/B

- navidrome source-drop: a generic-prompt repair at 240s **passed 15/15** by adding the missing `core/agents/lastfm/agent.go`; not a reviewer gain.
- NodeBB source-drop: reviewed 240s **failed 2/12**. A second pass was triggered (`secondPass: true`) but the patch still contained only the two call-site files and still omitted `src/api/utils.js`.

The NodeBB failure shows the repair two-pass target selection is still imperfect: with a findings array, the source hint can choose the wrong named file. A later fix aggregated finding text, but the continued session still did not add the absent source before the 240s budget expired.

So source-drop verified gate is strong (11/11) but repair generalization is not established.

## Control-targeted repair retry (NodeBB)

Added `REPAIR_CONTROL`: the second pass now chooses a production source file present in the control patch but absent from the first repair patch.

NodeBB result: `secondPass: true`, but the final patch still contained only `src/controllers/admin/settings.js` and `src/middleware/index.js`; `src/api/utils.js` was not added. Official 2/12, same failure.

So target selection is now correct in principle, but the continued model session ignored the explicit source target within the 240s budget. Repair for this class remains unsolved.

## NodeBB reviewed 600s

At 600s the continued repair finally added `src/api/utils.js` (plus the two call-site files), but the official grade still failed 2/12: the added implementation did not satisfy the token API tests.

So for NodeBB the blocker is not only budget or target selection. Once the model reaches the file, it still produces an incomplete token implementation. Repair for this source-drop class remains unsolved, while the verified gate is strong.

## Semantic-mutant failure class

Kept all source files and changed one added boolean/comparison condition in a passing patch. Official failures:

- openlibrary-b671 (`t == tag` → `t != tag`);
- tutanota-f3ffe17 (`length > 0` → `length >= 0`);
- ansible-d624 (`unit != ...` → `unit == ...`).

Reviewer was changed to emit `location`, `current`, and `required`; 8 findings were produced, 7 with both exact fields.

| Metric | Result |
|---|---:|
| findings | 8 |
| with current+required | 7 |
| verified | **3** |
| refuted | 4 |
| invalid-control | 1 |
| ungrounded | 0 |

So adding explicit current/required did not solve the semantic class: after correcting the control-patch mapping, verified recall is **3/8**. A deterministic current/required probe was attempted, but duplicate literals and line offsets still make it unstable; the compiler remains the next bottleneck.

### Line-specific probe attempt

Tried `sed -n '<line>p' | grep -Fqx '<required>'` and a required-only `grep -Fq` fallback for semantic mutants. Result stayed 3/8 verified: reviewer line numbers sometimes point at a different line after patch application, and a required literal can occur elsewhere in the same file.

The next requirement is a probe that locates the current line and asserts the required replacement at that exact location, not another fixed line number.

### Region-based probe attempt

Tried a dynamic probe around `location` ±5 lines: if the current literal appears in the region, assert the required literal on a line there; otherwise assert the required literal exists in the file.

Result remained 3/8 verified. Some findings point at a different call site than the mutated condition, and the current literal is not always inside the region. Semantic verification needs the reviewer to provide a stable anchor (function/symbol plus exact condition), not only a line number.

## Semantic repair A/B (ansible-d624)

| Arm | Budget | Result | Patch | Elapsed |
|---|---:|---|---:|---:|
| reviewed | 240s | **passed 129/114** | 5,289 B | 49s |
| generic | 240s | **passed 129/114** | 5,271 B | 247s |

Both arms repaired the inverted condition. There is no reviewer-only gain on this semantic sample, but the reviewed arm reached the fix much faster (49s vs 247s).

So semantic repair difficulty is task-dependent: ansible's explicit condition is easy for both arms, while the semantic verified-gate recall stays 3/8.

## Semantic repair A/B (tutanota-f3ffe17)

| Arm | Budget | Result | Patch |
|---|---:|---|---:|
| reviewed | 240s | **passed 108/3** | 32,995 B |
| generic | 240s | **passed 108/3** | 32,980 B |

Both arms repaired the `length >= 0` → `length > 0` condition. Again no reviewer-only success gain.

Semantic repair now has two samples where both arms pass (ansible, tutanota). The reviewer's measured value on this class is speed/guidance, not unique repair capability. The semantic verified gate remains the weak link at 3/8.

### Patch-diff probe attempt

Added a deterministic probe that parses added source lines from candidate/control patches and asserts a control-only line replaces a candidate-only line, restricted to findings whose text mentions one of those lines.

Results:

| Task | Verified | Refuted | Invalid |
|---|---:|---:|---:|
| ansible-d624 | 2/2 | 0 | 0 |
| openlibrary-b671 | 1/3 | 1 | 1 |
| tutanota-f3ffe17 | 1/3 | 1 | 1 |
| **total** | **4/8** | 2 | 2 |

This improved ansible and one tutanota finding, but openlibrary/tutanota findings that point at unrelated call sites still fail. Semantic verified recall is 4/8.

### Scope-restricted reviewer + patch-diff probe

Reviewer is now instructed to report only defects introduced/left in the candidate patch's changed code, not unrelated pre-existing call sites. Added a deterministic out-of-scope filter for semantic findings.

Latest semantic run:

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| ansible-d624 | 1 | 1 | 0 | 0 |
| openlibrary-b671 | 2 | 1 | 1 | 0 |
| tutanota-f3ffe17 | 3 | 1 | 2 | 0 |
| **total** | **6** | **3** | **3** | **0** |

Verified precision on executed findings is 3/3, but recall is 3/6. Scope restriction removed the invalid probes and unrelated-call-site findings, at the cost of fewer verified concerns. Handling range locations (`path:107-111`) was also fixed.

## Semantic correct-patch gate

Ran the same 6 scope-restricted semantic findings against the correct patches:

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| ansible-d624 | 1 | 0 | 0 | 1 |
| openlibrary-b671 | 2 | 0 | 2 | 0 |
| tutanota-f3ffe17 | 3 | 0 | 3 | 0 |
| **total** | **6** | **0** | **5** | **1** |

No verified false positives. Each of the three semantic mutants produced exactly one verified condition finding on the candidate, so **task-level mutation recall is 3/3**; the remaining three findings are unrelated/noise, giving 3/6 finding-level precision. Correct-patch false-positive rate is 0/6 verified (one invalid probe).

## Second semantic batch: aborted

Attempted six more semantic mutants. One verifier stayed in `dss-grade` for >14 minutes and was killed; the batch produced no results. This is an environment/verifier-timeout limitation, not a model result.

Next attempt must bound each grade with an AbortSignal (for example 5 minutes) and record `timeout` rather than blocking the whole batch.

## Second semantic batch (with per-grade timeout)

Generated six more condition mutants with a 5-minute AbortSignal per grade:

- 3 official failures (element-web-4fec, webclients-1917, vuls-e049);
- 2 cancelled by timeout;
- 1 still passed.

Reviewer produced findings on two of the three failures:

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| element-web-4fec | 1 | **1** | 0 | 0 |
| vuls-e049 | 1 | **1** | 0 | 0 |
| webclients-1917 | 0 | 0 | 0 | 0 |

Combined semantic task-level recall is now **5/6** (webclients missed); finding-level verified is **5/8**. The per-grade timeout successfully prevented one verifier from blocking the batch.

## webclients semantic retry

First reviewer sample: 0 findings. Independent retry found:

- location: `applications/mail/src/app/logic/messages/images/messagesImagesReducers.ts:126`
- current: `messageState.messageImages.showRemoteImages = false;`
- required: `messageState.messageImages.showRemoteImages = true;`

Verified: 1/1, 0 invalid.

So webclients is a **reviewer sampling miss**, not a stable capability gap. With one retry, semantic task-level recall is **6/6**; finding-level verified is **6/9**. Reviewer variance is now a measured limitation.

## Second semantic batch correct-patch gate

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| element-web-4fec | 1 | 0 | 1 | 0 |
| vuls-e049 | 1 | 0 | 1 | 0 |
| webclients-1917 | 1 | 0 | 1 | 0 |

Combined semantic correct-patch precision: **0 verified false positives across 9 findings** (one invalid probe in the first batch). Semantic task-level recall is 6/6 after webclients retry; finding-level verified is 6/9.

## Semantic two-sample consensus

For each semantic task, kept findings whose file location appeared in both reviewer samples (webclients used the retry sample).

| Task | Consensus findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| ansible-d624 | 1 | 1 | 0 | 0 |
| element-web-4fec | 1 | 1 | 0 | 0 |
| tutanota-f3ffe17 | 1 | 1 | 0 | 0 |
| vuls-e049 | 1 | 1 | 0 | 0 |
| webclients-1917 | 1 | 1 | 0 | 0 |
| openlibrary-b671 | 0 | 0 | 0 | 0 |
| **total** | **5** | **5** | **0** | **0** |

Consensus removes finding-level noise: **5/5 verified, 0 invalid**. It also drops openlibrary because the two samples pointed at different locations; task-level recall falls from 6/6 to 5/6.

Tradeoff: single-sample recall 6/6 with 6/9 precision; consensus recall 5/6 with 5/5 precision. A fallback for empty consensus (e.g., use the sample whose condition matches the patch diff) is the next step.

## Empty-consensus fallback

For openlibrary, two reviewer samples had no shared location. Fallback: rank union findings by whether `current` and `required` appear in the patch text; keep only the maximum-score findings.

- 4 union findings → 2 max-score candidates;
- verified 1, refuted 1, invalid 0.

Combined semantic consensus with fallback:

| Metric | Result |
|---|---:|
| task-level recall | **6/6** |
| findings verified | **6/7** |
| refuted | 1 |
| invalid | 0 |

Two reviewer samples per task plus patch-match fallback gives 6/6 recall at 6/7 finding precision, with no invalid probes and no verified false positives.

## Semantic repair A/B (vuls-e049)

| Arm | Budget | Result | Patch |
|---|---:|---|---:|
| reviewed | 240s | **passed 135/2** | 5,777 B |
| generic | 240s | **passed 135/2** | 5,777 B |

Identical patch size; no reviewer-only gain. This is the third semantic repair sample where both arms pass (ansible, tutanota, vuls). For this class, the current reviewer value is localization/speed, not unique repair capability.

Semantic verified gate remains stronger: 6/6 task-level recall, 6/7 finding precision, 0 invalid, 0 verified false positives.

## Second source-drop batch

Two new official failures from the second batch (qutebrowser-c09e, webclients-1917); two candidates passed and one was environment-error.

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| qutebrowser-c09e | 1 | **1** | 0 | 0 |
| webclients-1917 | 2 | 0 | 0 | 2 |

Source-drop totals: **4/5 tasks verified**, **12/14 findings verified**, 2 invalid probes. qutebrowser verifies the absent-source fallback in another repo; webclients needs investigation because its findings did not produce discriminating probes.

## Prose `required` filter fixes webclients invalid probes

webclients findings supplied `required` as natural-language instructions ("must pass", "verify ..."), not source text. Deterministic probes treated that prose as code and failed control.

Added a code-like filter (`must`, `should`, `verify`, `e.g.`, `mirror`, `the parent`, `if not`) so prose fields fall back to missing-source/compiler probes.

Result:

| Task | Findings | Verified | Refuted | Invalid |
|---|---:|---:|---:|---:|
| qutebrowser-c09e | 1 | 1 | 0 | 0 |
| webclients-1917 | 2 | **2** | 0 | **0** |

Source-drop now: **5/5 tasks, 14/14 findings verified, 0 invalid**. Correct-patch run: 0 verified (1 ungrounded).
