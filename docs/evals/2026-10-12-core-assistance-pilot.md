# Core assistance pilot — 2026-10-12

## Scope and frozen comparison

First round: task 0 and task 1 only. A selects `existing`; B selects `facts`.
Both use supervision on, independent execution off, the same worker and side model,
and the shared limit of 2 side calls, 4,000 output tokens and 30 seconds per prompt.
No reference model is required. `probe` and `recovery` are reserved and inactive.

Four unchanged engineering fixtures: `entrypoint`, `multi-file`, `api-contract`,
`simple-change`. Hidden acceptance stays outside the agent workspace. Function,
constraints and honest reporting are scored separately. A correct location or an
honest failure does not earn functional success. Runner and experiment metadata
record the corpus hash, models, modes and 180,000 ms task deadline.

Planned screening: 2 repetitions per task per group, 16 attempts. Before live work,
freeze model/version/effort, actual host/runtime, permissions, plugin SHA, fixture
hash, group order and cost policy in distinct A/B output directories. Missing
price or per-call usage remains unknown; no estimated cost advantage is claimed.
The user authorized current Claude configuration and manual approval between tasks
when complete cost cannot be reconciled. No automatic paid continuation in that case.

## Engineering evidence

Baseline `7659edd`: `node scripts/check.mjs` passes 121 host tests and existing
scorer/process checks. Task 0 observed RED for missing assist suite, then GREEN for
hidden functional scoring, protected tests, no-reference configuration, isolated
mode snapshots and killing the full main-agent process group at the configured
short deadline. Launcher and eight-task engineering scorer checks also pass.

## Results and gate

Live attempts: pending implementation and frozen configuration. No quality or
cost improvement is claimed. All 16 attempts remain unrun at this checkpoint.
Task 2 cannot start until two different target tasks provide auditable useful
facts, changed worker actions and passing independent acceptance, with A results
and all overhead reported. No CentOS 7 validation has occurred.
