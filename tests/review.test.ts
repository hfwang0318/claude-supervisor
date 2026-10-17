import { test, expect } from 'claude-code/testing'
import { buildReviewContext, parseReview, reviewPrompt, reviewNote, REVIEW_DIMENSIONS, hasExplorationEvidence } from '../supervisor/review'

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


test('checkpointed judgments must echo the host review and checkpoint identity exactly', async () => {
  const c = buildReviewContext(binding, asked, [{ role: 'assistant', text: 'Plan: preserve the interface with an adapter.' }], '', 'plan')!
  const checkpoint = { reviewId: 'r7', checkpointId: 'c12', observedAt: 100, sequence: 12, requirementSignature: 'req-sig', materialSignature: 'material-sig', sourceIds: c.sources.map(s => s.id), lastTool: { tool: 'Read', toolUseId: 'real-tool-id', path: 'api.js' } }
  const tracked = { ...c, checkpoint }
  const result = { reviewed: [], judgment: null, action: { kind: 'none' } }
  expect(parseReview(tracked, JSON.stringify(result))).toBeNull()
  expect(parseReview(tracked, JSON.stringify({ ...result, reviewId: 'other', checkpointId: 'c12' }))).toBeNull()
  expect(parseReview(tracked, JSON.stringify({ ...result, reviewId: 'r7', checkpointId: 'c12' }))).not.toBeNull()
  expect(reviewPrompt(tracked, 'supervise')).toContain('checkpointId')
})

test('negative native Grep results remain evidence but cannot spend the first exploration review', async () => {
  const rows: Parameters<typeof buildReviewContext>[2] = [{ role: 'assistant', text: '', toolUses: [
    { tool: 'Bash', input: { command: 'ls internal' }, text: 'storage\nconfig' },
    { tool: 'Grep', input: { path: '/p', pattern: 'Rollout' }, text: 'No matches found' },
    { tool: 'Grep', input: { path: '/p', pattern: 'features.yaml' }, text: 'No matches found' },
  ] }]
  const early = buildReviewContext(binding, asked, rows, '', 'plan')!
  expect(early.sources.some(s => s.text.includes('No matches found'))).toBe(true)
  expect(hasExplorationEvidence(early)).toBe(false)
  const withRead = [{ ...rows[0]!, toolUses: [...rows[0]!.toolUses!, { tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.validate = validate' }] }]
  expect(hasExplorationEvidence(buildReviewContext(binding, asked, withRead, '', 'plan')!)).toBe(false)
  const withMatch = [{ ...withRead[0]!, toolUses: [...withRead[0]!.toolUses, { tool: 'Grep', input: { path: '/p/api.js', pattern: 'validate' }, text: '12: exports.validate = validate // "No matches found" is a message, not this result' }] }]
  expect(hasExplorationEvidence(buildReviewContext(binding, asked, withMatch, '', 'plan')!)).toBe(true)
})
test('optional machine-action template keeps explicit checkpoint identity without restricting prose', async () => {
  const c = context()
  const tracked = { ...c, checkpoint: { reviewId: 'review-15', checkpointId: 'checkpoint-8-review-15', observedAt: 100, sequence: 8, requirementSignature: 'req', materialSignature: 'material', sourceIds: c.sources.map(s => s.id), lastTool: undefined } }
  const prompt = reviewPrompt(tracked, 'supervise')
  expect(prompt).toContain('Natural-language prose or Markdown')
  const line = prompt.split('\n\n').find(s => s.startsWith('Optional action template: '))
  expect(typeof line).toBe('string')
  const example = JSON.parse(line!.slice('Optional action template: '.length))
  expect(example.reviewId).toBe('review-15')
  expect(example.checkpointId).toBe('checkpoint-8-review-15')
  expect(parseReview(tracked, JSON.stringify(example), true)?.report).toBe(example.report)
  // The observed old reply remains rejected: never fill in missing provenance.
  expect(parseReview(tracked, '```json\n{"reviewed":["exploration","verification"],"judgment":null,"action":{"kind":"none"}}\n```')).toBeNull()
  expect(parseReview(tracked, '{"reviewed":["exploration","verification"],"judgment":null,"action":{"kind":"none"}}')).toBeNull()
})

test('probe instructions distinguish generated file objects from existing source and restrict commands', async () => {
  const prompt = reviewPrompt(context(), 'supervise')
  expect(prompt).toContain('"path":"__supervisor_probes/check.js","content":"console.log(0)"')
  expect(prompt).toContain('Existing source paths are not files entries')
  expect(prompt).toContain('one import-and-print line, one workspace script, or a project check')
  expect(prompt).toContain('grep pipelines are not probes; use location')
  expect(prompt).toContain('existing-test requires the exact command in a supplied tool observation')
})

test('feedback separates reviewer paraphrases from exact source returns without silently rewriting the judgment', async () => {
  const c=buildReviewContext(binding,asked,rows,'api.go\n+ func (v Value) Err() error { return nil }\n+ func (v Value) Unify(other Value) Value { return Value{} }','implementation')!
  const r=reply('architecture');r.judgment.sourceIds=['req','change'];r.judgment.reason='Err and Unify always return nil.'
  const parsed=parseReview(c,JSON.stringify(r))!,note=reviewNote(c,parsed)
  expect(note).toContain('Err and Unify always return nil.')
  expect(note).toContain('Unify(other Value) Value { return Value{} }')
  expect(note.indexOf('Source fidelity:')).toBeLessThan(note.indexOf('Reason:'))
  expect(note).toContain('not independently checked')
  expect(parsed.judgment?.reason).toBe(r.judgment.reason)
})
test('omitted history creates an explicit evidence limit for both reviewer input and returned advice', async () => {
  const c=context();c.scope.omitted.push('earlier-tools')
  const parsed=parseReview(c,JSON.stringify(reply()))!
  const note=reviewNote(c,parsed),prompt=reviewPrompt(c,'supervise')
  expect(note).toContain('Earlier history is omitted')
  expect(prompt).toContain('Earlier history is omitted')
  expect(note).toContain('never happened or was the only check')
  expect(note).toContain('bounded change excerpt')
  const withoutEarlier=reviewNote(context(),parsed)
  expect(withoutEarlier.includes('Earlier history is omitted')).toBe(false)
})


test('advisory response accepts multiple natural-language concerns without categories or echoed identity', async () => {
  const c = { ...context(), checkpoint: { reviewId: 'r', checkpointId: 'c', observedAt: 100, sequence: 4, requirementSignature: 'req', materialSignature: 'mat', sourceIds: ['req','change'] } }
  const text = '1. The timer in change can overlap; compare the shared-timer requirement.\n2. The public API may change; inspect callers before committing. These are hypotheses, not verified defects.'
  const r = parseReview(c, text, true)!
  expect(r?.report).toBe(text)
  expect(r?.reviewed).toEqual([])
  expect(r?.action.kind).toBe('none')
  const note = reviewNote(c, r)
  expect(note).toContain(text)
  expect(note).toContain('checkpoint c')
  expect(note).toContain('not independently checked')
  expect(note).toContain('not classified')
})
test('optional action requires a strict bound envelope while malformed commands stay advisory', async () => {
  const c = { ...context(), checkpoint: { reviewId: 'r', checkpointId: 'c', observedAt: 100, sequence: 4, requirementSignature: 'req', materialSignature: 'mat', sourceIds: ['req','change'] } }
  const report = 'Two issues: timer ownership and caller compatibility. Read api.js for evidence.'
  const good = { report, reviewId: 'r', checkpointId: 'c', action: { kind: 'location', request: { paths: ['api.js'], terms: [] } } }
  expect(parseReview(c, JSON.stringify(good), true)?.action.kind).toBe('location')
  for (const value of [{...good, checkpointId:'other'}, {...good, action:{kind:'shell',command:'rm -rf .'}}, {...good, action:{kind:'location',request:{paths:['../secret'],terms:[]}}}]) {
    const r = parseReview(c, JSON.stringify(value), true)!
    expect(r.report).toBe(report)
    expect(r.action.kind).toBe('none')
    expect(r.actionRejected).toBe(true)
  }
  expect(parseReview(c, 'Run `rm -rf .` then retry.', true)?.action.kind).toBe('none')
})
test('advisory mode keeps privacy and size rejection and does not require one-judgment JSON', async () => {
  expect(parseReview(context(), 'password=private-value-123', true)).toBeNull()
  expect(parseReview(context(), 'x'.repeat(70000), true)).toBeNull()
  expect(parseReview(context(), '   ', true)).toBeNull()
  const prompt = reviewPrompt(context(), 'supervise')
  expect(prompt).toContain('all important, distinct concerns')
  expect(prompt).toContain('Natural-language prose or Markdown')
  expect(prompt.includes('Give at most one important grounded judgment')).toBe(false)
  expect(prompt.includes('Return exactly one raw JSON object')).toBe(false)
})


test('multi-concern report triage keeps resolved history and hidden-grader guesses out of current issues', async () => {
  const prompt = reviewPrompt(context(), 'supervise')
  expect(prompt).toContain('Only unresolved, material concerns belong in the problem list')
  expect(prompt).toContain('Resolved issues are counterevidence')
  expect(prompt).toContain('Do not invent hidden-test or hidden-grader expectations')
  expect(prompt).toContain('observed design trade-offs')
  expect(prompt).toContain('all important, distinct concerns')
  expect(prompt.includes('Give at most one important grounded judgment')).toBe(false)
})
