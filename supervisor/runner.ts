import type { Budget, ExecutionEvidence, ProbeCandidate, Snapshot } from './contracts'
import type { Host } from './ports'
import { sameBinding } from './coordinator'

export const classifyOutput = (exitCode: number | null, text: string, truncated: boolean): ExecutionEvidence['outcome'] => {
  if (exitCode === null || truncated) return 'unknown'
  if (/No module named|ModuleNotFoundError|Cannot find module|SyntaxError|command not found|No such file|Operation not permitted|timed out|sandbox.*denied/i.test(text)) return 'environment-error'
  if (exitCode !== 0 || /\bFAILED\b|\b[1-9]\d* failed\b|\bAssertionError\b/.test(text)) return 'failed'
  return 'passed'
}

export const executeProbe = async (host: Host, candidate: ProbeCandidate, snapshot: Snapshot, budget: Budget): Promise<ExecutionEvidence> => {
  const now = await host.now()
  const unknown: ExecutionEvidence = { id: candidate.id, binding: candidate.binding, command: candidate.command, cwd: snapshot.root, checkScope: [], exitCode: null, stdout: '', stderr: '', truncated: false, outcome: 'unknown', startedAt: now, endedAt: now }
  if (snapshot.isolation !== 'boxed-copy' || !sameBinding(candidate.binding, snapshot.binding) || !candidate.command.trim() || candidate.command.length > 4096 || candidate.files.length > 3 || candidate.files.reduce((n, f) => n + f.content.length, 0) > 65536 || now + 500 >= budget.deadlineMs) return unknown
  try {
    const observed = await host.execute(candidate.command, snapshot, budget.deadlineMs, candidate.files)
    if (!sameBinding(observed.binding, candidate.binding) || observed.command !== candidate.command || observed.cwd !== snapshot.root || observed.endedAt > budget.deadlineMs) return unknown
    return observed
  } catch { return unknown }
}
