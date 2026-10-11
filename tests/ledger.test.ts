import { test, expect } from 'claude-code/testing'
import { validateVerdict, validateObservation, mergeIssueState } from '../supervisor/ledger'
import type { Binding, ExecutionEvidence, ProbeCandidate } from '../supervisor/contracts'
const binding: Binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'sha256', snapshotId: 'snap' }
const candidate: ProbeCandidate = { id: 'p', binding, command: 'node test.cjs', files: [], requirementIds: ['r'], question: 'existing tests hold', oracle: 'existing-test', oracleExplanation: 'preserve the original test', oracleSourceIds: ['r'] }
const evidence: ExecutionEvidence = { id: 'e', binding, command: 'node test.cjs', cwd: '/copy', checkScope: ['node:test.cjs'], exitCode: 1, stdout: 'AssertionError: 1 != 2', stderr: '', truncated: false, outcome: 'failed', startedAt: 1, endedAt: 2 }

test('fabricated command or output and truncated observations never authenticate a verdict', async () => {
  expect(validateObservation('node other.cjs', 'AssertionError', evidence, binding)).toBe(false)
  expect(validateObservation('node test.cjs', 'FAILED', evidence, binding)).toBe(false)
  expect(validateObservation('node test.cjs', 'AssertionError', { ...evidence, truncated: true }, binding)).toBe(false)
  expect(validateObservation('node test.cjs', 'AssertionError', evidence, { ...binding, workspaceRevision: 'new' })).toBe(false)
  expect(validateObservation('node test.cjs', 'AssertionError', evidence, binding)).toBe(true)
})

test('generated oracles and environment failures remain hypotheses or unknown', async () => {
  expect(validateVerdict(candidate, evidence, binding, []).status).toBe('hypothesis')
  const requirements = [{ id: 'r', text: 'Keep existing tests', sourceMessageId: 'prompt-1', quote: 'Keep existing tests', status: 'explicit' as const }]
  expect(validateVerdict(candidate, evidence, binding, requirements).status).toBe('demonstrated')
  expect(validateVerdict({ ...candidate, files: [{ path: '__supervisor_probes/x.cjs', content: 'assert.equal(1, 2)' }] }, evidence, binding, requirements).status).toBe('hypothesis')
  expect(validateVerdict(candidate, { ...evidence, outcome: 'environment-error' }, binding, requirements).status).toBe('unknown')
})

test('disclosure and contesting never change the defect resolution', async () => {
  expect(mergeIssueState({ resolution: 'open', disclosed: false, contested: false }, 'told')).toEqual({ resolution: 'open', disclosed: true, contested: false })
  expect(mergeIssueState({ resolution: 'unknown', disclosed: false, contested: false }, 'refuted')).toEqual({ resolution: 'unknown', disclosed: false, contested: true })
})

import { normalizeTrack } from '../supervisor/ledger'
test('legacy disclosure and refutation migrate without manufacturing fixed evidence', async () => {
  const old = { nextId: 4, issues: [{ id: 1, status: 'fixed', from: 'verify' }, { id: 2, status: 'told', from: 'rule' }, { id: 3, status: 'refuted', from: 'verify' }], seen: [], runs: 0 }
  const migrated = normalizeTrack(old)
  expect(migrated?.schemaVersion).toBe(2)
  expect(migrated?.issues[0]?.resolution).toBe('unknown')
  expect(migrated?.issues[1]?.disclosed).toBe(true)
  expect(migrated?.issues[1]?.resolution).toBe('open')
  expect(migrated?.issues[2]?.contested).toBe(true)
  expect(normalizeTrack({ ...old, schemaVersion: 99 })).toBeNull()
  expect(normalizeTrack({ nextId: 'broken' })).toBeNull()
})
