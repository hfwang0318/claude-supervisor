# Evidence lifecycle

Status: implemented foundation, 2026-10-11.

Coordinator isolates session identity and generations, limits expensive work to
one active job, and rejects old bindings after prompts, off, reload, session end
or observed tool-batch changes. Calls, protocol retries and output reservations
share the prompt's 2-call/4k-token/30s activity budget. Model refusal never falls
back. A capability profile is explicit configuration, not an alias ranking.

Command identity and exact observed excerpts are checked in the matching copy.
Environment errors and truncation produce unknown. Original-file changes in a
copy or source manifest changes invalidate its result. Legacy semantic text is
advisory and cannot authenticate a requirement oracle, block completion, or prove
repair through error-text disappearance. Independent oracle-backed feedback is
reserved for P1 after G0b/E0.

Issue resolution, disclosure and contesting are separate fields. Schema 2 migrates
legacy fixed without evidence to unknown; unknown schemas preserve their record.
State uses host CAS; diagnostics are serialized. Latest execution observations
are redacted and persisted before use, bounded per job. Unknown delivery is not
retried automatically; old generations are never resumed on reload.

Pending E0 work includes complete queued-intent handling, full current-workspace
binding for main-agent record checks, durable delivery/job recovery fixtures and
complete session-level evidence retention/replay. Current modules are a P0
foundation and do not establish that every engineering gate has passed.
