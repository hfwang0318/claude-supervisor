# Execution isolation

Status: opt-in foundation, 2026-10-11.

The trusted Node service copies actual current files and compares SHA-256 content
and mode manifests before/after copying and against the copy. It supports Git and
non-Git directories without depending on HEAD or named Edit tools. Git metadata
and supervisor scratch are excluded; code/tests/config/generated files are kept.
Symlinks, special files, known secret paths and >10k entries or >50MiB fail closed.

A macOS deny-default profile allows system runtime reads, only the active Node
executable and resolved dynamic libraries, writes only inside the copy, and no
network. Child environment is explicit (including OPENSSL_CONF=/dev/null); user
secrets are not inherited. Output is bounded at the receiving stream to 1MiB.
Deadline expiry/SIGTERM terminates the detached process group. Normal completion
also kills leftover members. Copy deletion checks the ownership record, identity
and path; it never deletes the real workspace or an unrecognized directory.

Real-file/process self-tests cover dirty/untracked data, denied original writes,
network/environment denial, truncated output, timeout and ownership mismatch.
This is not a proof of isolation for arbitrary hostile projects or processes
escaping the original process group. Complete host-VM cancellation, orphan cleanup
and unsupported-project dependency fixtures remain E0 work. Execution defaults
off; unavailable execution remains read-only and cannot certify a defect.
