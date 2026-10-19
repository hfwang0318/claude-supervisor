import { test, expect } from 'claude-code/testing'
import { buildReviewContext } from '../supervisor/review'
import { parseProbeCandidate, probeNote } from '../supervisor/probes'
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
const context = buildReviewContext(binding, 'Empty input must return zero.', [{ role: 'assistant', text: 'Plan: reuse the existing parser.', toolUses: [] }], '', 'plan')!
const candidate = { question: 'Does empty input return zero?', requirementQuote: 'Empty input must return zero.', command: 'node check.js', files: [], oracle: 'spec-example', oracleExplanation: 'The explicit empty-input requirement; behavior still needs checking.', sourceIds: ['req'] }

test('a probe binds an explicit requirement and preserves its hypothesis status', async () => {
  const c = parseProbeCandidate(context, candidate)!
  expect(c.binding).toEqual(binding)
  expect(c.requirementIds).toEqual(['req'])
  expect(probeNote(c, null)).toContain('not executed')
  expect(probeNote(c, null)).toContain('hypothesis')
})
test('a probe can carry a bounded location and current/required contract', async () => {
  const withContract = { ...candidate, location: 'src/parser.ts:42', current: 'return 1', required: 'return 0' }
  const c = parseProbeCandidate(context, withContract)!
  expect(c.location).toBe('src/parser.ts:42')
  expect(c.current).toBe('return 1')
  expect(c.required).toBe('return 0')
  const note = probeNote(c, null)
  expect(note).toContain('Location: src/parser.ts:42')
  expect(note).toContain('Current: return 1')
  expect(note).toContain('Required: return 0')
  expect(parseProbeCandidate(context, { ...candidate, location: 42 })).toBeNull()
  expect(parseProbeCandidate(context, { ...candidate, required: 'x'.repeat(4097) })).toBeNull()
})
test('invented oracles, sources, expectations and unsafe commands cannot become probe candidates', async () => {
  for (const change of [{ oracle: 'certified' }, { sourceIds: ['missing'] }, { requirementQuote: 'Negative values must return zero' }, { command: 'rm -rf src' }, { files: [{ path: '../probe.js', content: 'x' }] }, { files: [{ path: '.env', content: 'x' }] }, { demonstrated: true }]) expect(parseProbeCandidate(context, { ...candidate, ...change })).toBeNull()
})
test('generated files are bounded and cannot read credentials through source content', async () => {
  expect(parseProbeCandidate(context, { ...candidate, files: [{ path: 'check.js', content: 'x'.repeat(65537) }] })).toBeNull()
  expect(parseProbeCandidate(context, { ...candidate, files: [{ path: 'check.js', content: 'const password = "private-value-123"' }] })).toBeNull()
  expect(parseProbeCandidate(context, { ...candidate, command: 'node __supervisor_probes/check.js', files: [{ path: '__supervisor_probes/check.js', content: 'console.log(0)' }] })).not.toBeNull()
})
test('an environment error or generated expectation is never a demonstrated defect', async () => {
  const c = parseProbeCandidate(context, candidate)!
  const e = { id: 'e', binding, command: c.command, cwd: '/copy', checkScope: ['check.js'], exitCode: 1, stdout: '', stderr: 'Cannot find module parser', truncated: false, outcome: 'environment-error' as const, startedAt: 0, endedAt: 1 }
  expect(probeNote(c, e)).toContain('environment-error')
  expect(probeNote(c, e)).not.toContain('demonstrated')
  expect(probeNote(c, { ...e, stderr: '', stdout: 'AssertionError', outcome: 'failed' })).toContain('hypothesis')
})
