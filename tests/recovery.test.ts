import { test, expect } from 'claude-code/testing'
import { buildReviewContext } from '../supervisor/review'
import { buildRecoveryPacket, recoveryObservations } from '../supervisor/recovery'
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
const context = (outputs = ['AssertionError: expected zero', 'AssertionError: expected zero', 'AssertionError: expected zero']) => buildReviewContext(binding, 'Empty input must return zero.', [{ role: 'assistant', text: '', toolUses: outputs.map(text => ({ tool: 'Bash', input: { command: 'node check.js' }, text, ...(text.startsWith('PASS') ? {} : { isError: true as const }) })) }], '', 'failure')!

test('recovery summarizes actual repeated failures and one unresolved question without invented eliminations', async () => {
  const c = context(), ids = recoveryObservations(c)
  expect(ids.length).toBe(3)
  const note = buildRecoveryPacket(c, ids, 'Which assumption about empty input should be checked?')!
  expect(note).toContain('AssertionError: expected zero')
  expect(note).toContain('No hypothesis is considered ruled out')
  expect(note).toContain('unresolved question')
})
test('different errors, reasonable confirmation and later success do not trigger recovery', async () => {
  for (const outputs of [['AssertionError: a'], ['AssertionError: a', 'AssertionError: b', 'AssertionError: c'], ['AssertionError: a', 'AssertionError: a', 'PASS'], ['AssertionError: a', 'PASS', 'AssertionError: a']]) expect(recoveryObservations(context(outputs))).toEqual([])
})
test('unknown evidence IDs or a success after the chosen failures cannot support recovery', async () => {
  const c = context()
  expect(buildRecoveryPacket(c, ['invented'], 'What next?')).toBeNull()
  expect(buildRecoveryPacket(context(['AssertionError: a', 'AssertionError: a', 'AssertionError: a', 'PASS']), ['tool-1', 'tool-2', 'tool-3'], 'What next?')).toBeNull()
})
