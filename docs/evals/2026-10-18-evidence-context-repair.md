# Evidence context and diagnostic fidelity repair

This batch follows the first callback-driven real-model pilot. The user authorized continued optimization of its concrete findings. No new paid observation, accepted-task retry, grading run, automatic next task, merge or push was performed. The existing evaluation artifacts remain frozen.

## Changes

The incremental context now reserves space for the captured bounded change material before adding narrative and tool records. An identical final narrative/answer is supplied once, as the answer. New/prior source ID lists are filtered to sources actually included. Proposed edits stay proposals; bounded changes stay recorded excerpts, never a full current diff.

A separate bounded cache retains up to8 original project-check observations within8192bytes so ordinary browsing cannot immediately evict a failed check, its later result or a pristine comparison. Selection reuses existing command/check recognition only; it is not a new semantic-stage detector. The final selected record window remains at most32records/24576bytes. Material context remains49152bytes before the host attaches its checkpoint. Check recognition does not establish execution success, equivalence between commands, a repair or current applicability. The cache is finite and may still omit useful old evidence; those limits remain explicit.

A boundary regression exposed that adding an omission flag after filling the context could itself exceed its cap. Selection now reserves omission metadata first and measures the actual serialized candidate context, including array separators. The final new/prior ID lists contain no discarded source IDs.

Diagnostic logging keeps native redaction enabled. All new records use correlated JSON parts with a pre-log UTF-16 length and FNV checksum, used to detect ordinary log mutations rather than authenticate evidence. The reader distinguishes:

- reconstructable unaltered diagnostics in `inputs`;
- complete, metadata-consistent but altered diagnostics in `alteredInputs`, with `exactPreparedInput:false`;
- missing, duplicated, mismatched or malformed parts as unavailable/incomplete.

Changed text never becomes an exact prepared-input record or source fact. The reader does not encode around redaction, execute material or reconstruct removed private data. Legacy formats remain readable; legacy records without checksums cannot detect equal-length changes. Source/model/checkpoint/action protocols and isolation gates are unchanged.

The reviewer prompt now asks for assertion-to-requirement comparison: exact delay versus eventual timeout, immediate dispatch versus a later tick, intermediate loading/placeholders versus final content, and real integration paths versus direct dispatch or mocks. It asks for a distinguishing counterexample without inventing its outcome. Incremental prose considers all advisory dimensions according to the actual material; the final prompt no longer presents the legacy attributed-plan availability list as an advisory restriction. Legacy structured validation remains unchanged. These are reviewer instructions, not deterministic correctness classifications or demonstrated semantic improvements.

## Reproduction and verification

The first2new host regressions failed against the previous production code:332pass/2fail. After material reservation, deduplication and check anchors they passed:334pass/0fail. A further boundary test failed:334pass/1fail, then passed after reserving metadata. A pre-existing host test that assumed inline short diagnostics was updated to reassemble the declared parts; its behavioral requirement, auditing inputs even when the provider never answers, remains intact.

Producer/reader regressions first failed for both length-changing host edits and equal-length edits being mistaken for original diagnostics. The fixed reader distinguishes altered-but-complete material, while missing/duplicated/mismatched-part and retained-session-identity negative controls remain rejected. No host redaction code was modified.

The recorded corpus now has9curated cases from rounds009–017 and incremental pilot001, plus the diagnostic-framing regression. `node eval/replay-review.mjs` executes10checks through production context/parser/scheduler/delivery functions and verifies14available source artifact hashes. Pilot001's actual completion sources, original prior pristine observation and selected code excerpts reach the same reviewer input; identical final narrative/answer is retained once. File diffs known unchanged after the original checkpoint are used; the later retained test file and retry-slice repair are explicitly excluded from that historical input. Sensitive file excerpts are omitted independently, never rewritten into code evidence.

The original frozen pilot diagnostic is also read without modifying it. The old reader reported2reconstructed inputs and1incomplete input. The new reader reports2reconstructed inputs,1complete-but-altered input and0incomplete inputs, correctly preserving the observed31590→31618character mismatch as non-exact evidence.

The complete unabridged `node scripts/check.mjs` passed on the final code: manifest/hook contracts, TypeScript, **335host tests**, real read-only/scoped/process-isolation checks, recorded regressions, every scorer selftest and every SWE Pro selftest. No required check was narrowed.

A new offline native fixture used the unchanged2.1.295Linux CLI, Node and GNU loader, Docker networking disabled and a loopback synthetic provider. It made0paid calls and ran0candidate-project commands; one isolated fixture Write and3synthetic printf steps exercised the native lifecycle. A harmless nested Token fixture intentionally triggers native log redaction. Both actual review calls still reach subsequent main requests with both synthetic concerns, the first-write context has no executed change, and completion includes actual change. The diagnostics are correctly classified as2complete-but-altered,0exact,0missing/malformed; driver exits0. Final source/adapter/binary/loader hashes are verified. An earlier native fixture preceded the final byte-boundary fix and is not the final source gate.

Local ignored evidence is under `.superpowers/sdd/2026-10-18-evidence-context-repair/`: RED/GREEN logs, `release-checks.log`, `actual-replay.log`, `verify-native.mjs`, `native-final/receipt.json` and `protected-results.json`. The282prior critical receipt hashes (255historical rounds plus27pilot001) remain unchanged. AGENTS.md, node_modules, generated declarations, frozen binaries and global Router were not edited. No evaluation containers remain.

## Limits and next observation

Free replay proves what material is preserved, how diagnostics are classified, and that native delivery still works. The oracle gaps are human-reviewed labels; no uncalled model is credited with detecting them. Neither the new prompt nor richer historical material is proof of better reviewer judgment, a repaired benchmark result or lower cost. Finite anchors can still lose relevant evidence, and priority ordering remains a tunable starting policy. A later real observation must freeze this new source and ask whether these exact missing-code/counterevidence/oracle failures improve, with actual main actions and independent checks. This batch does not automatically authorize that paid run.
