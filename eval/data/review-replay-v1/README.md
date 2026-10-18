# Recorded reviewer regression cases

Nine curated cases extracted from actual local review-iterations rounds009–017 and incremental pilot001. `cases.json` contains bounded public excerpts/event facts, provenance hashes and human-labeled expected behavior. It contains no raw provider logs, private thinking, credentials or session metadata.

The broader local archive contains17rounds/34runs. See the event-driven incremental-review design for inventory, limitations, proposed free replay layers and candidate N comparison. Original archives remain under ignored `eval/results/review-iterations-flash/`; do not commit or rewrite them.

Run `node eval/replay-review.mjs` for free production context/parser/scheduler/delivery regression checks (also included in `node scripts/check.mjs`). They do not replay model reasoning, prove improved model judgment, or certify project patches. The historical first-edit gap now drives an incremental material regression; actual native ordering and delivery are separately checked with an offline synthetic host fixture. Neither establishes future reviewer judgment quality.

Actual private bytes remain omitted: the 36/2/34 record shape drives clearly labeled synthetic privacy controls. Some labels require manual semantic review. Use exact source/command/version evidence for deterministic assertions and add negative controls. Do not use report counts or acknowledgments as correctness/causal-success labels. No model call or project command is needed to inspect these fixtures.

Pilot001 adds the original completion sources, a prior pristine-check observation and selected file diffs known unchanged after that checkpoint. Post-feedback test and slice repairs are explicitly excluded from the historical input. The replay exercises material selection, answer deduplication and preservation of counterevidence. The actual frozen diagnostic also exercises complete-but-host-altered parsing when locally available; its source hash is checked. A separate producer/reader regression mutates equal-length text and removes parts, preventing false exactness or fabricated completeness.

The timing, integration and loading-oracle gaps are human-reviewed labels. Free replay supplies those actual assertions/requirements to the production prompt; it does not assert that an uncalled reviewer detected the gaps or that future advice is correct.
