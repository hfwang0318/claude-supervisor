# Recorded reviewer regression cases

Eight curated cases extracted from actual local review-iterations rounds009–017. `cases.json` contains bounded public excerpts/event facts, provenance hashes and human-labeled expected behavior. It contains no raw provider logs, private thinking, credentials or session metadata.

The broader local archive contains17rounds/34runs. See the event-driven incremental-review design for inventory, limitations, proposed free replay layers and candidate N comparison. Original archives remain under ignored `eval/results/review-iterations-flash/`; do not commit or rewrite them.

These fixtures support free context/parser/scheduler/delivery regression tests as those components are implemented. They do not replay model reasoning, prove improved model judgment, or certify project patches. In particular, `technical-text-before-first-edit` is a known current production coverage gap, not a passing new callback test.

Some labels require manual semantic review. Use exact source/command/version evidence for deterministic assertions and add negative controls. Do not use report counts or acknowledgments as correctness/causal-success labels. No model call or project command is needed to inspect these fixtures.
