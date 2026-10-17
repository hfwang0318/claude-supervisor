# Recorded reviewer regression cases

Eight curated cases extracted from actual local review-iterations rounds009–017. `cases.json` contains bounded public excerpts/event facts, provenance hashes and human-labeled expected behavior. It contains no raw provider logs, private thinking, credentials or session metadata.

The broader local archive contains17rounds/34runs. See the event-driven incremental-review design for inventory, limitations, proposed free replay layers and candidate N comparison. Original archives remain under ignored `eval/results/review-iterations-flash/`; do not commit or rewrite them.

Run `node eval/replay-review.mjs` for free production context/parser/scheduler/delivery regression checks (also included in `node scripts/check.mjs`). They do not replay model reasoning, prove improved model judgment, or certify project patches. The historical first-edit gap now drives an incremental material regression; actual native ordering and delivery are separately checked with an offline synthetic host fixture. Neither establishes future reviewer judgment quality.

Actual private bytes remain omitted: the 36/2/34 record shape drives clearly labeled synthetic privacy controls. Some labels require manual semantic review. Use exact source/command/version evidence for deterministic assertions and add negative controls. Do not use report counts or acknowledgments as correctness/causal-success labels. No model call or project command is needed to inspect these fixtures.
