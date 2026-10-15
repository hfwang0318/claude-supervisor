import { test, expect } from 'claude-code/testing'
import { buildReviewContext, parseReview, reviewPrompt, reviewNote, REVIEW_DIMENSIONS } from '../supervisor/review'

const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v1', snapshotId: 'unknown' }
const asked = 'Keep one shared timer and preserve the public API.'
const rows = [{ role: 'assistant', text: 'Plan: use separate timers for each operation.', toolUses: [] }]
const context = () => buildReviewContext(binding, asked, rows, 'scheduler.ts\n- sharedTimer()\n+ timers.forEach(start)', 'implementation')!
const reply = (dimension = 'requirement-plan') => ({ reviewed: [dimension], judgment: { dimension, question: 'Does this keep one timer?', requirementQuote: 'Keep one shared timer', sourceIds: ['req', 'plan-1'], reason: 'Separate timers conflict with the requested shared timer.', impact: 'Overlapping operations can schedule repeated refreshes.', recommendation: 'replan', uncertainty: 'The implementation still needs a behavior check.' }, action: { kind: 'none' } })

test('a sourced requirement-plan conflict can advise replanning without a command', async () => {
  const c = context(), r = parseReview(c, JSON.stringify(reply()))
  expect(r?.judgment?.recommendation).toBe('replan')
  expect(reviewNote(c, r!)).toContain('advisory')
  expect(reviewNote(c, r!)).toContain('Separate timers conflict')
  expect(reviewNote(c, r!)).toContain('not reviewed')
})
test('architecture and direction judgments remain usable without execution or repair verdicts', async () => {
  for (const dimension of ['architecture', 'direction']) {
    const r = reply(dimension)
    expect(parseReview(context(), JSON.stringify(r))?.judgment?.dimension).toBe(dimension)
  }
})
test('plan-implementation review must cite both the actual plan and actual change', async () => {
  const r = reply('plan-implementation')
  expect(parseReview(context(), JSON.stringify(r))).toBeNull()
  r.judgment.sourceIds.push('change')
  expect(parseReview(context(), JSON.stringify(r))).not.toBeNull()
})
test('a missing plan cannot be invented or reported as reviewed', async () => {
  const c = buildReviewContext(binding, asked, [], 'file.ts\n+ const timer = 1', 'completion')!
  expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
  expect(parseReview(c, JSON.stringify(reply()))).toBeNull()
})
test('unknown source references, invented requirement quotes and certification fields are rejected', async () => {
  const r = reply()
  expect(parseReview(context(), JSON.stringify({ ...r, demonstrated: true }))).toBeNull()
  expect(parseReview(context(), JSON.stringify({ ...r, judgment: { ...r.judgment, sourceIds: ['req', 'invented'] } }))).toBeNull()
  expect(parseReview(context(), JSON.stringify({ ...r, judgment: { ...r.judgment, requirementQuote: 'Allow any number of timers' } }))).toBeNull()
  expect(parseReview(context(), 'null')).toBeNull()
})
test('the prompt covers all process judgments and distinguishes advice from proof', async () => {
  const prompt = reviewPrompt(context(), 'supervise')
  for (const dimension of REVIEW_DIMENSIONS) expect(prompt).toContain(dimension)
  expect(prompt).toContain('counterevidence')
  expect(prompt).toContain('untrusted')
  expect(prompt).toContain('not a correctness certificate')
})
test('secret or oversized sources are omitted with explicit unreviewed scope', async () => {
  const c = buildReviewContext(binding, asked, [{ role: 'assistant', text: 'Plan: password=private-value-123', toolUses: [] }], 'x'.repeat(70000), 'completion')!
  expect(c.sources.some(s => s.kind === 'change')).toBe(false)
  expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
  expect(c.scope.omitted.length > 0).toBe(true)
  expect(reviewPrompt(c, 'supervise')).not.toContain('private-value-123')
  expect(buildReviewContext(binding, 'x'.repeat(70000), [], '', 'plan')).toBeNull()
})
test('only explicit future plans are attributed to the main model', async () => {
  const c = buildReviewContext(binding, asked, [{ role: 'assistant', text: 'Implemented the requested change.', toolUses: [] }], '', 'completion')!
  expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
})
test('an all-clear answer cannot claim dimensions without their context', async () => {
  const c = buildReviewContext(binding, asked, [], '', 'completion')!
  expect(parseReview(c, JSON.stringify({ reviewed: ['architecture'], judgment: null, action: { kind: 'none' } }))).toBeNull()
  expect(parseReview(c, JSON.stringify({ reviewed: [], judgment: null, action: { kind: 'none' } }))).not.toBeNull()
})
test('negated, historical or quoted plan words cannot manufacture a current plan', async () => {
  for (const text of ['目前没有方案，先读取现有实现。', '还没计划好，先看代码。', '这段注释里有“计划”二字。', '> Plan: replace the API.', 'The old plan was rejected.']) {
    const c = buildReviewContext(binding, asked, [{ role: 'assistant', text, toolUses: [] }], '', 'plan')!
    expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
    expect(parseReview(c, JSON.stringify({ reviewed: ['requirement-plan'], judgment: null, action: { kind: 'none' } }))).toBeNull()
  }
  expect(buildReviewContext(binding, asked, [{ role: 'assistant', text: '方案：保留接口并修复内部实现。', toolUses: [] }], '', 'plan')!.sources.some(s => s.kind === 'plan')).toBe(true)
})
test('verification context retains actual exit status, stderr and truncation instead of success-looking text alone', async () => {
  const c = buildReviewContext(binding, asked, [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' }, text: '1 passed', result: { exitCode: 1, isStdoutTruncated: true, stderr: 'AssertionError: hidden failure' } }] }], '', 'completion')!
  const observed = JSON.parse(c.sources.find(s => s.kind === 'observation')!.text)
  expect(observed.exitCode).toBe(1)
  expect(observed.truncated).toBe(true)
  expect(observed.output).toContain('AssertionError: hidden failure')
  expect(c.scope.omitted).toContain('observation-incomplete')
  const pending = buildReviewContext(binding, asked, [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' } }] }], '', 'completion')!
  expect(pending.sources.some(s => s.kind === 'observation')).toBe(false)
  expect(parseReview(pending, JSON.stringify({ reviewed: ['verification'], judgment: null, action: { kind: 'none' } }))).toBeNull()
})

test('generic repository reconnaissance is not attributed as a technical plan', async () => {
  for (const text of ["I'll start by exploring the repository structure to understand the codebase.", 'I will first inspect the repository.', 'Plan: browse the project structure.', '我将先查看项目结构。']) {
    const c = buildReviewContext(binding, asked, [{ role: 'assistant', text, toolUses: [] }], '', 'plan')!
    expect(c.sources.some(s => s.kind === 'plan')).toBe(false)
    expect(parseReview(c, JSON.stringify({ reviewed: ['requirement-plan'], judgment: null, action: { kind: 'none' } }))).toBeNull()
  }
  for (const text of ["I'll preserve the API by adding an adapter around the shared scheduler.", 'Plan: inspect the timer ownership, then centralize cancellation in Scheduler.', '我将保留接口并将取消操作集中到调度器。']) {
    expect(buildReviewContext(binding, asked, [{ role: 'assistant', text, toolUses: [] }], '', 'plan')!.sources.some(s => s.kind === 'plan')).toBe(true)
  }
})
