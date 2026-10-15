import { test, expect } from 'claude-code/testing'
import type { Host } from '../supervisor/ports'
import type { ReviewReply } from '../supervisor/contracts'
import { buildReviewContext } from '../supervisor/review'
import { runReviewFlow } from '../supervisor/review-flow'
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
const context = buildReviewContext(binding, 'Preserve the API.', [{ role: 'assistant', text: 'Plan: replace the public method.', toolUses: [] }], 'file.js\n+ replacement()', 'implementation')!
const decision: ReviewReply = { reviewed: ['architecture'], judgment: { dimension: 'architecture', question: 'Is replacing the interface necessary?', requirementQuote: 'Preserve the API.', sourceIds: ['req', 'plan-1'], reason: 'The plan removes an interface that callers still use.', impact: 'Caller compatibility.', recommendation: 'adjust', uncertainty: 'Callers have not been fully inspected.' }, action: { kind: 'none' } }
const world = () => {
  const counts = { captures: 0, runs: 0, cleans: 0, reads: 0, valid: true }
  const snapshot = { id: 'copy', root: '/copy', isolation: 'boxed-copy' as const, sourceManifestHash: 'hash', binding: { ...binding, workspaceRevision: 'hash', snapshotId: 'copy' } }
  const host: Host = { now: async () => 100, cwd: async () => '/p', identity: async () => ({ sessionId: 's', workerId: 'fixture' }), persist: async () => {}, deliver: async () => 'delivered', capture: async () => { counts.captures++; return snapshot }, cleanup: async () => { counts.cleans++ }, execute: async (command, copy) => { counts.runs++; return { id: 'e', binding: copy.binding, command, cwd: copy.root, checkScope: [command], exitCode: 1, stdout: 'AssertionError: mismatch', stderr: '', truncated: false, outcome: 'failed', startedAt: 100, endedAt: 101 } }, inspectFacts: async () => { counts.reads++; return { facts: [], files: [], manifestHash: '', incomplete: true, failureReason: 'source-missing' } }, validateFacts: async () => counts.valid, validateSnapshot: async () => counts.valid }
  return { counts, host }
}
const ports = (host: Host, executionMode: 'off' | 'enabled' | 'shadow' = 'off') => ({ host, executionMode, deadlineMs: 10000, current: async () => true, ask: async () => null })
const probe = { ...decision, action: { kind: 'probe' as const, candidate: { question: 'Does the existing caller still work?', requirementQuote: 'Preserve the API.', command: 'node check.js', files: [], oracle: 'spec-example', oracleExplanation: 'Preserve the caller contract; unverified.', sourceIds: ['req'] } } }

test('a grounded architecture judgment reaches the main model without a command', async () => {
  const { host, counts } = world(), result = await runReviewFlow(context, decision, ports(host))
  expect(result.note).toContain('Caller compatibility')
  expect(await result.validate()).toBe(true)
  expect(counts.runs).toBe(0)
  await result.cleanup()
})
test('off mode offers an explicitly unexecuted probe without capturing or running', async () => {
  const { host, counts } = world(), result = await runReviewFlow(context, probe, ports(host))
  expect(result.note).toContain('not executed')
  expect(counts.captures).toBe(0); expect(counts.runs).toBe(0)
})
test('enabled execution uses a matching isolated snapshot and revalidates before delivery', async () => {
  const { host, counts } = world(), result = await runReviewFlow(context, probe, ports(host, 'enabled'))
  expect(counts.runs).toBe(1)
  expect(result.note).toContain('hypothesis')
  expect(await result.validate()).toBe(true)
  counts.valid = false
  expect(await result.validate()).toBe(false)
  await result.cleanup()
  expect(counts.cleans).toBe(1)
})
test('shadow executes only in an isolated copy and returns no model feedback', async () => {
  const { host, counts } = world(), result = await runReviewFlow(context, probe, ports(host, 'shadow'))
  expect(counts.runs).toBe(1)
  expect(result.note).toBeNull()
  await result.cleanup()
})
test('a source rejection preserves grounded judgment but never invents supplemental facts', async () => {
  const { host, counts } = world(), result = await runReviewFlow(context, { ...decision, action: { kind: 'location', request: { paths: ['missing.js'], terms: [] } } }, ports(host))
  expect(result.note).toContain('Caller compatibility')
  expect(result.note).toContain('source-missing')
  expect(result.view).toBeNull()
  expect(counts.reads).toBe(1)
})
test('stale work has no feedback, and invalid candidates cannot execute', async () => {
  const { host, counts } = world()
  const stale = await runReviewFlow(context, decision, { ...ports(host), current: async () => false })
  expect(stale.note).toBeNull()
  const invalid = await runReviewFlow(context, { ...probe, action: { kind: 'probe', candidate: {} } }, ports(host, 'enabled'))
  expect(invalid.reason).toBe('invalid-action')
  expect(counts.runs).toBe(0)
})
test('verified supplemental source is delivered only while its manifest remains current', async () => {
  const { host, counts } = world()
  host.inspectFacts = async () => ({ facts: [{ id: 'source-1', path: 'api.js', startLine: 1, endLine: 1, quote: 'exports.old = () => 1', fileHash: 'hash' }], files: [{ path: 'api.js', hash: 'hash' }], manifestHash: 'manifest', incomplete: false } as never)
  const result = await runReviewFlow(context, { ...decision, action: { kind: 'location', request: { paths: ['api.js'], terms: [] } } }, ports(host))
  expect(result.note).toContain('exports.old = () => 1')
  expect(await result.validate()).toBe(true)
  counts.valid = false
  expect(await result.validate()).toBe(false)
})
