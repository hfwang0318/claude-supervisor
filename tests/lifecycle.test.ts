import { test, expect } from 'claude-code/testing'
import { Coordinator, sameBinding } from '../supervisor/coordinator'
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

test('a detached review job survives main invalidation but cannot commit stale evidence', async () => {
  const c = new Coordinator(binding)
  const job = c.start('review', 0, { detached: true })
  c.invalidate({ ...binding, taskRevision: 2, turnId: 't2' })
  expect(job?.signal.aborted).toBe(false)
  expect(c.finish('review', binding, 'succeeded')).toBe(false)
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
  expect(c.reserveCall(0, 2500)).toEqual({ maxTokens: 2500, reservedTokens: 2500, timeoutMs: 30000 })
  c.recordUsage(1000, 2500)
  expect(c.reserveCall(10000, 4000)).toEqual({ maxTokens: 1500, reservedTokens: 1500, timeoutMs: 20000 })
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
  expect(c.reserveCall(10000, 2000)).toEqual({ maxTokens: 2000, reservedTokens: 2000, timeoutMs: 20000 })
  expect(c.reserveCall(10000, 1)).toBeNull()
})

test('historical review keeps a pending job and exactly-once advice when execution advances', async () => {
  const c = new Coordinator(binding, { historical: true })
  const job = c.start('old-review', 0)
  c.changedWorkspace('later-edit', 50000)
  expect(job?.signal.aborted).toBe(false)
  expect(sameBinding(binding, c.binding)).toBe(false)
  expect(c.finish('old-review', binding, 'succeeded', 50000)).toBe(true)
  let delivered = 0
  await c.deliver('old-review', binding, async () => { delivered++; return 'delivered' })
  await c.deliver('old-review', binding, async () => { delivered++; return 'delivered' })
  expect(delivered).toBe(1)
})
test('model waiting does not spend the historical tool budget or add a model timeout', async () => {
  const c = new Coordinator(binding, { historical: true })
  c.start('review', 0)
  expect(c.reserveCall(10, 2000)).toEqual({ maxTokens: 2000, reservedTokens: 2000 })
  c.pauseModel(binding, 10)
  c.resumeModel(binding, 90010)
  expect(c.remainingTime(90010)).toBe(29990)
  c.finish('review', binding, 'succeeded', 100010)
  expect(c.remainingTime(100010)).toBe(19990)
  c.start('review-two', 100010)
  expect(c.reserveCall(100010, 2000)).toEqual({ maxTokens: 2000, reservedTokens: 2000 })
  expect(c.reserveCall(100011, 1)).toBeNull()
})
test('an old historical request cannot resume accounting or deliver into a new prompt', async () => {
  const c = new Coordinator(binding, { historical: true })
  const job = c.start('old-review', 0)
  c.reserveCall(0, 2000); c.pauseModel(binding, 0)
  const next = { ...binding, taskRevision: 2, turnId: 'new-prompt' }
  c.invalidate(next)
  c.start('new-review', 100000)
  c.resumeModel(binding, 200000)
  expect(job?.signal.aborted).toBe(true)
  expect(await c.deliver('old-review', binding, async () => 'delivered')).toBe('dropped')
  expect(c.remainingTime(100001)).toBe(29999)
})

test('an in-flight delivery invalidated by a new prompt never commits its completion into the new task', async () => {
  const c = new Coordinator(binding, { historical: true })
  let release = () => {}; const waiting = new Promise<void>(r => { release = r })
  const delivery = c.deliver('r1', binding, async () => { await waiting; return 'delivered' })
  c.invalidate({ ...binding, turnId: 'new', taskRevision: 2 })
  release()
  expect(await delivery).toBe('dropped')
})


test('native thinking allowance is reserved inside the shared output budget', async () => {
  const c = new Coordinator(binding, { historical: true })
  const reservation = c.reserveCall(0, 1952, 2048)
  expect(reservation?.maxTokens).toBe(1952)
  expect(reservation?.reservedTokens).toBe(4000)
  c.recordUsage(3000, reservation!.reservedTokens)
  expect(c.reserveCall(100000, 1, 2048)).toBeNull()
})
test('reported output exceeding its reservation closes further admission without replenishment', async () => {
  const c = new Coordinator(binding, { historical: true })
  const reservation = c.reserveCall(0, 1000)
  expect(c.recordUsage(1200, reservation!.reservedTokens)).toBe(false)
  expect(c.reserveCall(0, 1)).toBeNull()
})
for (const bad of [NaN, Infinity, -1]) test(`invalid reservation ${bad} never opens a model call`, async () => {
  const c = new Coordinator(binding, { historical: true })
  expect(c.reserveCall(0, bad)).toBeNull()
  expect(c.reserveCall(0, 1, bad)).toBeNull()
})

test('configured semantic reservations stay finite across task reset without refunding output allowance', () => {
  const c = new Coordinator(binding, { historical: true, maxCalls: 3, outputTokens: 12000 })
  for (let i = 0; i < 3; i++) expect(c.reserveCall(i, 1952, 2048)).toEqual({ maxTokens: 1952, reservedTokens: 4000 })
  expect(c.reserveCall(4, 1)).toBeNull()
  c.invalidate({ ...binding, taskRevision: 2 })
  for (let i = 0; i < 3; i++) expect(c.reserveCall(i, 1952, 2048)).not.toBeNull()
  expect(c.reserveCall(4, 1)).toBeNull()
})
