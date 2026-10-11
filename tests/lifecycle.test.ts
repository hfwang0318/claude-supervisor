import { test, expect } from 'claude-code/testing'
import { Coordinator } from '../supervisor/coordinator'
import type { Binding } from '../supervisor/contracts'

const binding: Binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'w', snapshotId: 'snap' }

test('new task invalidates in-flight work and prevents old results committing', async () => {
  const c = new Coordinator(binding)
  const job = c.start('j', 0)
  expect(job !== null).toBe(true)
  c.invalidate({ ...binding, taskRevision: 2, turnId: 't2' })
  expect(c.finish('j', binding, 'succeeded')).toBe(false)
  expect(job?.signal.aborted).toBe(true)
})

test('a terminal job cannot restart and an expensive job is single flight', async () => {
  const c = new Coordinator(binding)
  expect(c.start('j', 0) !== null).toBe(true)
  expect(c.start('another', 0)).toBeNull()
  expect(c.finish('j', binding, 'succeeded')).toBe(true)
  expect(c.start('j', 1)).toBeNull()
  expect(c.finish('j', binding, 'failed')).toBe(false)
})

test('unknown delivery is not retried and session delivery identities are isolated', async () => {
  const c = new Coordinator(binding)
  let calls = 0
  const deliver = async () => { calls++; throw Error('connection lost after write') }
  expect(await c.deliver('finding', binding, deliver)).toBe('unknown')
  expect(await c.deliver('finding', binding, deliver)).toBe('unknown')
  expect(calls).toBe(1)
  const other = new Coordinator({ ...binding, sessionId: 'other' })
  expect(await other.deliver('finding', { ...binding, sessionId: 'other' }, async () => 'delivered')).toBe('delivered')
})

test('prompt budgets cap all calls including protocol retries and stop after two failures', async () => {
  const c = new Coordinator(binding)
  expect(c.reserveCall(0, 2500)).toEqual({ maxTokens: 2500, timeoutMs: 30000 })
  c.recordUsage(1000)
  expect(c.reserveCall(10000, 4000)).toEqual({ maxTokens: 1500, timeoutMs: 20000 })
  expect(c.reserveCall(10001, 1)).toBeNull()
  c.invalidate({ ...binding, turnId: 'new' })
  c.recordFailure()
  c.recordFailure()
  expect(c.reserveCall(0, 1)).toBeNull()
})

test('a model switch cancels old work without replenishing the prompt budget', async () => {
  const c = new Coordinator(binding)
  const job = c.start('j', 0)
  c.reserveCall(0, 2000)
  c.invalidate({ ...binding, generationId: 'changed-model' }, { preserveBudget: true, now: 10000 })
  expect(job?.signal.aborted).toBe(true)
  expect(c.reserveCall(10000, 2000)).toEqual({ maxTokens: 2000, timeoutMs: 20000 })
  expect(c.reserveCall(10000, 1)).toBeNull()
})
