import { test, expect } from 'claude-code/testing'
import { buildIncrementalContext, reviewPrompt } from '../supervisor/review'
import { IncrementalReview, observeStream } from '../supervisor/incremental'

const text = 'Let me implement pendingActions and fetchOwed while preserving one shared timer.'
test('completed main steps admit raw technical narrative without recognizing a phase', () => {
  const r = new IncrementalReview(3)
  r.step('t:1', text)
  r.step('t:1', text)
  r.step('t:2', '')
  expect(r.take()).toBeNull()
  r.step('t:3', 'An alternative is a shared callback.')
  const p = r.take()!
  expect(p.reasons).toEqual(['interval'])
  expect(p.sources.some(s => s.text === text && s.kind === 'narrative')).toBe(true)
  r.step('t:4', ''); r.step('t:5', ''); r.step('t:6', '')
  expect(r.take()).toBeNull()
})
test('the first proposed write is pinned before execution and survives ordinary coalescing', () => {
  const r = new IncrementalReview(1)
  r.step('1', text)
  r.add('edit-1', 'proposed-change', 'Edit fixture.ts: old -> new')
  r.request('first-write')
  r.step('2', 'Later implementation summary.')
  r.step('3', 'More work.')
  const p = r.take()!
  expect(p.reasons).toEqual(['first-write'])
  expect(p.sources.some(s => s.text === text)).toBe(true)
  expect(p.sources.some(s => s.text === 'Later implementation summary.')).toBe(false)
  expect(r.take()?.sources.some(s => s.text === 'More work.')).toBe(true)
})
test('failure and completion opportunities survive a busy reviewer and duplicate milestones do not loop', () => {
  const r = new IncrementalReview(5)
  r.add('failed-1', 'observation', 'go: dependency unavailable; project behavior unknown')
  r.request('failure', 'failed-1'); r.request('failure', 'failed-1')
  r.add('answer', 'answer', 'Completed, dependency verification remains unknown.')
  r.request('completion', 'answer')
  expect(r.take()?.reasons).toEqual(['failure'])
  expect(r.take()?.reasons).toEqual(['completion'])
  expect(r.take()).toBeNull()
})
test('sensitive material is omitted, bounded eviction is explicit and reset discards all prior task work', () => {
  const r = new IncrementalReview(1)
  r.add('private', 'narrative', 'Authorization: Bearer secret-value')
  for (let i = 0; i < 80; i++) r.add(`row-${i}`, 'narrative', String(i) + '界'.repeat(1000))
  r.request('completion')
  const p = r.take()!
  expect(p.omitted).toContain('incremental-material-budget')
  expect(p.omitted).toContain('privacy-affected-incremental-material')
  expect(JSON.stringify(p.sources).includes('secret-value')).toBe(false)
  expect(new TextEncoder().encode(JSON.stringify(p.sources)).length < 30000).toBe(true)
  r.reset(); expect(r.take()).toBeNull()
  r.step('1', 'New task only')
  expect(r.take()?.sources.length).toBe(1)
})

test('incremental context lets the reviewer choose dimensions without treating narration as an attributed plan', async () => {
  const r = new IncrementalReview(1)
  r.step('1', text); r.add('proposal', 'proposed-change', '{"tool":"Edit","input":{"file_path":"timer.ts","old_string":"old","new_string":"new"}}'); r.request('first-write')
  const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
  const c = buildIncrementalContext(binding, 'Preserve the API.', r.take()!, '', 'plan')!
  expect(c.sources.some(s => s.kind === 'narrative' && s.text === text)).toBe(true)
  expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
  expect(reviewPrompt(c, 'supervise')).toContain('Select the applicable')
  expect(reviewPrompt(c, 'supervise')).toContain('proposed-change')
})

test('new evidence is distinguished from prior anchors and identical narration does not buy another call', () => {
  const r = new IncrementalReview(1)
  r.step('1', text)
  const first = r.take()!
  expect(first.newSourceIds).toEqual([first.sources[0]!.id])
  r.step('2', text)
  expect(r.take()).toBeNull()
  r.step('3', 'New evidence refutes the proposed alternative.')
  const next = r.take()!
  expect(next.newSourceIds).toEqual([next.sources.at(-1)!.id])
  expect(next.priorAnchorIds).toEqual([first.sources[0]!.id])
})

test('pending overflow preserves the first-write snapshot even when a failure preceded it', () => {
  const r = new IncrementalReview(5)
  r.add('failure', 'observation', 'Dependency unavailable'); r.request('failure')
  r.add('proposal', 'proposed-change', 'Write timer.ts'); r.request('first-write')
  for (let i = 0; i < 6; i++) { r.add(`check-${i}`, 'observation', `check ${i}`); r.request('verification', String(i)) }
  const checkpoints = []; while (r.pending) checkpoints.push(r.take()!)
  expect(checkpoints.some(p => p.reasons.includes('first-write'))).toBe(true)
  expect(checkpoints.some(p => p.omitted.includes('pending-milestone-budget'))).toBe(true)
})

test('public stream observation preserves chunks and closes upstream on consumer cancellation', async () => {
  let closed = false
  const chunk = { kind: 'text', text: 'public only' }
  const upstream = (async function* () { try { yield chunk; return 'finished' } finally { closed = true } })()
  const observed: unknown[] = []
  const stream = observeStream(upstream, value => observed.push(value))
  expect((await stream.next()).value).toBe(chunk)
  expect(observed).toEqual([chunk])
  await stream.return(undefined as never)
  expect(closed).toBe(true)
})
test('public stream observation delegates a consumer error to the upstream handler', async () => {
  let caught = false
  const upstream = (async function* () { try { yield 'first' } catch { caught = true; yield 'recovered' } return 'finished' })()
  const stream = observeStream(upstream, () => {})
  await stream.next()
  expect((await stream.throw(Error('consumer interruption'))).value).toBe('recovered')
  expect(caught).toBe(true)
  expect((await stream.next()).value).toBe('finished')
})

test('completion preserves actual bounded changes ahead of repeated final narration', () => {
  const r = new IncrementalReview(5)
  const answer = 'Completed and verified. '.repeat(160)
  for (let i = 0; i < 14; i++) r.add(`read-${i}`, 'tool', `read-${i}:` + 'x'.repeat(1200))
  r.add('narrative-final', 'narrative', answer)
  r.add('answer-final', 'answer', answer)
  r.request('completion')
  const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
  const changes = 'scheduler.ts\n- previous\n+ ' + 'c'.repeat(23000)
  const c = buildIncrementalContext(binding, 'Keep loading until the owed fetch commits.', r.take()!, changes, 'completion')!
  expect(c.sources.some(s => s.kind === 'change' && s.text === changes)).toBe(true)
  expect(c.sources.filter(s => s.text === answer).length).toBe(1)
  expect(c.sources.some(s => s.kind === 'answer' && s.text === answer)).toBe(true)
  expect(new TextEncoder().encode(JSON.stringify(c)).length <= 49152).toBe(true)
})

test('bounded verification anchors survive later browsing without certifying a repair', () => {
  const r = new IncrementalReview(5)
  const failed = JSON.stringify({ tool: 'Bash', input: { command: 'jest timing.test.ts' }, output: 'Expected: 2; Received: 1', completed: true, exitCode: 1, truncated: false })
  const passed = JSON.stringify({ tool: 'Bash', input: { command: 'jest timing.test.ts' }, output: 'Tests: 4 passed', completed: true, exitCode: 0, truncated: false })
  const pristine = JSON.stringify({ tool: 'Bash', input: { command: 'git stash; jest baseline.test.ts; git stash pop' }, output: 'Tests: 1 passed; page 0 bounce', completed: true, exitCode: 0, truncated: false })
  r.add('failed', 'observation', failed)
  r.add('fixed', 'observation', passed)
  r.add('pristine', 'observation', pristine)
  for (let i = 0; i < 50; i++) r.add(`browse-${i}`, 'tool', `read-${i}:` + 'x'.repeat(1500))
  r.add('summary', 'answer', 'Completed; previous failure resolved in this scope.')
  r.request('completion')
  const p = r.take()!
  for (const text of [failed, passed, pristine]) expect(p.sources.some(s => s.text === text)).toBe(true)
  expect(p.sources.filter(s => s.kind === 'observation').length).toBe(3)
  expect(new TextEncoder().encode(JSON.stringify(p.sources)).length <= 24576).toBe(true)
  expect(p.omitted).toContain('incremental-material-budget')
})

test('context byte bounds include omission metadata and source ids never reference discarded records', () => {
  const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
  for (let size = 9300; size < 9900; size++) {
    const opportunity = { reasons: ['completion' as const], sequence: 2, sources: [{ id: 'event-1', kind: 'tool' as const, text: 'x'.repeat(size) }, { id: 'event-2', kind: 'tool' as const, text: 'y'.repeat(16000) }], omitted: [], newSourceIds: ['event-1', 'event-2'], priorAnchorIds: [] }
    const c = buildIncrementalContext(binding, 'r'.repeat(16000), opportunity, 'c'.repeat(23000), 'completion')!
    expect(new TextEncoder().encode(JSON.stringify(c)).length <= 49152).toBe(true)
    expect(c.opportunity!.newSourceIds.every(id => c.sources.some(s => s.id === id))).toBe(true)
  }
})
