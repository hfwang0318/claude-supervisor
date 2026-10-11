import { test, expect } from 'claude-code/testing'
import type { Binding, ExecutionEvidence, ProbeCandidate, Snapshot } from '../supervisor/contracts'
import type { Host } from '../supervisor/ports'
import { executeProbe, classifyOutput } from '../supervisor/runner'
import { captureSnapshot } from '../supervisor/workspace'
const binding: Binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'hash', snapshotId: 'snap' }
const snapshot: Snapshot = { id: 'snap', binding, root: '/copy', sourceManifestHash: 'hash', isolation: 'boxed-copy' }
const candidate: ProbeCandidate = { id: 'p', binding, requirementIds: ['r'], question: 'test', command: 'node test.cjs', files: [], oracle: 'existing-test', oracleExplanation: '', oracleSourceIds: ['r'] }
const evidence: ExecutionEvidence = { id: 'e', binding, command: 'node test.cjs', cwd: '/copy', checkScope: ['node test.cjs'], exitCode: 1, stdout: 'AssertionError', stderr: '', truncated: false, outcome: 'failed', startedAt: 0, endedAt: 2 }
const budget = { remainingSideCalls: 2, remainingOutputTokens: 4000, remainingActiveMs: 30000, deadlineMs: 30000 }

test('an unbound candidate, expired deadline or read-only snapshot executes no command', async () => {
  let commands = 0
  const host = { now: async () => 0, execute: async () => { commands++; return evidence } } as unknown as Host
  for (const [probe, copy, limits] of [
    [{ ...candidate, binding: { ...binding, taskRevision: 2 } }, snapshot, budget],
    [candidate, { ...snapshot, isolation: 'read-only' }, budget],
    [candidate, snapshot, { ...budget, deadlineMs: 100 }]
  ] as const) expect((await executeProbe(host, probe, copy, limits)).outcome).toBe('unknown')
  expect(commands).toBe(0)
  expect((await executeProbe(host, candidate, snapshot, budget)).outcome).toBe('failed')
})

test('copy inconsistency is cleaned up and never represented as an executable snapshot', async () => {
  let cleaned = false
  const host = { now: async () => 0, capture: async () => ({ ...snapshot, sourceManifestHash: 'different' }), cleanup: async () => { cleaned = true } } as unknown as Host
  expect(await captureSnapshot(host, binding, 1000)).toBeNull()
  expect(cleaned).toBe(true)
})

test('environment errors, truncated output and false-green failures remain distinct', async () => {
  expect(classifyOutput(1, 'ModuleNotFoundError: dependency', false)).toBe('environment-error')
  expect(classifyOutput(null, 'OK', false)).toBe('unknown')
  expect(classifyOutput(0, 'OK', true)).toBe('unknown')
  expect(classifyOutput(0, 'FAILED (failures=1)', false)).toBe('failed')
  expect(classifyOutput(0, '0 failed, 12 passed', false)).toBe('passed')
})
