import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
const usage = { input_tokens: 30, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const options = { assistance_mode: 'facts', execution_mode: 'off', verifier_model: 'fixture' }
const view = { facts: [{ id: 'f1', path: 'app.cjs', startLine: 1, quote: 'exports.day = require("./utils.cjs").parseDate', fileHash: 'a'.repeat(64) }], files: [{ path: 'app.cjs', fileHash: 'a'.repeat(64) }], manifestHash: 'b'.repeat(64), incomplete: false }
const packet = JSON.stringify({ kind: 'location', question: 'Where is parseDate loaded?', requirementQuote: 'Fix parseDate', factIds: ['f1'], observationIds: [], explanation: 'The candidate may not be the entry used.', nextCheck: null, requiresMainJudgment: true })
const world = (on: Parameters<TestBody>[1], beforeStoreSet?: (key: string, value: unknown) => Promise<void>) => {
  if (!beforeStoreSet) mock.store(on)
  else {
    const values = new Map<string, unknown>()
    on('store.get', (_$, e) => ({ value: values.get(e.key) }))
    on('store.set', async (_$, e) => { await beforeStoreSet(e.key, e.value); values.set(e.key, JSON.parse(JSON.stringify(e.value))); return { value: undefined } })
    on('store.delete', (_$, e) => { values.delete(e.key); return { value: undefined } })
    on('store.keys', () => ({ value: [...values.keys()] }))
  }
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 12) })
  const state = { calls: 0, reads: 0, validations: 0, outputTokens: 20, logs: [] as string[], pauseStatus: false, inStatus: false, waitStatus: undefined as Promise<void> | undefined, valid: true, incomplete: false, failureReason: 'traversal-limit', processError: false, modelDelayMs: 0, outputs: ['{"paths":["app.cjs"],"terms":["parseDate"]}', packet], wait: undefined as Promise<void> | undefined, rows: [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/util.cjs' }, text: 'exports.parseDate = s => Number(s.slice(-2))' }] }] }
  on('session.id', () => ({ value: 'facts-session' }))
  on('session.model', () => ({ value: 'fixture' }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.messages', () => ({ value: state.rows }) as never)
  on('env.get', () => ({ value: 'on' }))
  on('ui.log', (_$, e) => { state.logs.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('state.get', async (_$, e, next) => {
    if (state.pauseStatus && state.calls === 2 && e.key === 'track') { state.pauseStatus = false; state.inStatus = true; await state.waitStatus }
    return next(e)
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/p' }))
  on('classic.PostToolBatch', () => ({ additionalContext: ['host context'] }) as never)
  on('classic.Stop', () => ({}) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    if (state.processError) throw Error('secret=private-source-value')
    const request = JSON.parse(e.init?.stdin ?? '{}')
    let result: unknown
    if (request.action === 'inspect') { state.reads++; result = { ...view, incomplete: state.incomplete, ...(state.incomplete ? { failureReason: state.failureReason } : {}), ...(request.request.searchPaths ? { searchScope: { paths: request.request.searchPaths, terms: request.request.terms } } : {}) } }
    else if (request.action === 'validate-facts') { state.validations++; result = state.valid }
    else throw Error('facts mode must never capture or execute')
    return { value: { exitCode: 0, stdout: JSON.stringify(result), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('model.complete', async () => {
    state.calls++
    if (state.modelDelayMs) await clock.advance(state.modelDelayMs)
    const text = state.outputs.shift() ?? 'invalid'
    if (state.calls === 2 && state.wait) await state.wait
    return { value: { isAnswered: true, text, usage: { ...usage, output_tokens: state.outputTokens } } } as never
  })
  return { state, clock }
}
const start = async ($: Parameters<TestBody>[0]) => {
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'Fix parseDate used by app.cjs.', origin: { kind: 'sdk' } } as never)
}
const batch = ($: Parameters<TestBody>[0]) => $.classic.PostToolBatch({ tool_calls: [] } as never) as Promise<{ additionalContext?: string[] }>

test('facts mode appends actual source after a batch once, preserves host context and never runs existing review', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  const result = await batch($)
  expect(result.additionalContext?.[0]).toBe('host context')
  expect(result.additionalContext?.join('\n')).toContain('app.cjs:1')
  expect(result.additionalContext?.join('\n')).toContain('require("./utils.cjs")')
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await $.classic.Stop({ last_assistant_message: 'Done.', stop_hook_active: false } as never)
  expect(state.calls).toBe(2)
  expect(state.validations).toBe(1)
})
test('changed hashes, incomplete inspection and invalid second replies produce no packet or retry', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.valid = false
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(2)
  await start($); state.calls = 0; state.incomplete = true; state.outputs = ['{"paths":["app.cjs"],"terms":[]}']
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
  await start($); state.calls = 0; state.incomplete = false; state.valid = true; state.outputs = ['{"paths":["app.cjs"],"terms":[]}', 'invalid']
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(2)
})
for (const invalidation of ['prompt', 'off', 'cancel', 'workspace']) test(`late facts reply after ${invalidation} is discarded`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release: () => void = () => {}
  state.wait = new Promise<void>(r => { release = r })
  const pending = batch($)
  for (let n = 0; n < 10 && state.calls < 2; n++) await clock.advance(10)
  expect(state.calls).toBe(2)
  if (invalidation === 'prompt') await $.prompt.submit({ text: 'New task.', origin: { kind: 'composer' } } as never)
  if (invalidation === 'off') await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  if (invalidation === 'cancel') await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
  if (invalidation === 'workspace') { state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/utils.cjs' }, text: 'changed' }] }); await batch($) }
  release()
  expect((await pending).additionalContext).toEqual(['host context'])
})
test('simple change and null reply require no inspection or repeated fact job', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.outputs = ['null']
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await batch($)
  expect(state.calls).toBe(1); expect(state.reads).toBe(0)
  await start($); state.calls = 0
  state.rows[0]!.toolUses[0]!.text = 'exports.label = "Welcom"'
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(0)
})

test('combined fact-selection and packet input cannot exceed 64KiB', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  await $.prompt.submit({ text: 'Fix parseDate ' + 'a'.repeat(40000), origin: { kind: 'sdk' } } as never)
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
})

for (const invalidate of ['prompt', 'off', 'cancel']) test(`facts packet dropped after final UI wait and ${invalidate} is not logged delivered`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release: () => void = () => {}
  state.waitStatus = new Promise<void>(r => { release = r }); state.pauseStatus = true
  const pending = batch($)
  for (let n = 0; n < 100 && !state.inStatus; n++) await clock.advance(10)
  expect(state.inStatus).toBe(true)
  if (invalidate === 'prompt') await $.prompt.submit({ text: 'New task.', origin: { kind: 'composer' } } as never)
  if (invalidate === 'off') await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  if (invalidate === 'cancel') await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
  release()
  expect((await pending).additionalContext).toEqual(['host context'])
  expect(state.logs.filter(l => l.includes('ASSIST') && l.includes('"delivery":"delivered"'))).toEqual([])
})
test('side usage telemetry remains numeric after host token-name redaction', { options }, async ($, on) => {
  const { state } = world(on); await start($); await batch($)
  const events = state.logs.filter(l => l.includes('SIDE_CALL')).map(l => JSON.parse(l.slice(l.indexOf('SIDE_CALL') + 10)))
  expect(events[0].output).toBe(20)
  expect(events[0].usage).toBeUndefined()
})

test('a response reaching its output cap stays unknown and stops without inspection or retry', { options }, async ($, on) => {
  const { state } = world(on); await start($); state.outputTokens = 2000
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await batch($)
  expect(state.calls).toBe(1); expect(state.reads).toBe(0)
})

test('host-shaped trailing tool results preserve the first eligible facts job', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.rows.push({ role: 'user', text: '', toolUses: [] })
  expect((await batch($)).additionalContext?.join('\n')).toContain('app.cjs:1')
  expect(state.calls).toBe(2)
})
test('a scoped request carries local source facts and its limits through the real hook', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.outputs = ['{"paths":[],"terms":["parseDate"],"searchPaths":["app.cjs"]}', packet]
  const result = (await batch($)).additionalContext?.join('\n') ?? ''
  expect(result).toContain('require("./utils.cjs")')
  expect(result).toContain('outside this search scope remains unknown')
  expect(state.calls).toBe(2)
  expect((await batch($)).additionalContext).toEqual(['host context'])
})
test('incomplete inspection records only its stage and does not spend another model call', { options }, async ($, on) => {
  const { state } = world(on); await start($); state.incomplete = true
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await batch($)
  expect(state.calls).toBe(1)
  expect(state.logs.some(l => l.includes('FACTS_JOB') && l.includes('"stage":"inspection"') && l.includes('"result":"unknown"'))).toBe(true)
})
test('a stalled stage diagnostic write cannot hold a prepared facts packet', { options }, async ($, on) => {
  let release: () => void = () => {}, stalled = false, settled = false
  const hold = new Promise<void>(r => { release = r })
  const { state, clock } = world(on, async (key, value) => {
    if (key === 'history' && Array.isArray(value) && value.at(-1)?.kind === 'assistance-attempt') { stalled = true; await hold }
  })
  await start($)
  const pending = batch($).then(result => { settled = true; return result })
  for (let n = 0; n < 100 && !stalled; n++) await clock.advance(10)
  for (let n = 0; n < 10 && !settled; n++) await clock.advance(10)
  const returnedWhileStalled = settled
  release()
  const result = await pending
  expect(stalled).toBe(true)
  expect(returnedWhileStalled).toBe(true)
  expect(result.additionalContext?.join('\n')).toContain('app.cjs:1')
  expect(state.calls).toBe(2)
})

for (const [reported, expected] of [['traversal-limit', 'traversal-limit'], ['secret=password-value', 'inspection-unknown']] as const) test(`incomplete source inspection reports only an allowed reason: ${expected}`, { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.incomplete = true; state.failureReason = reported
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await batch($)
  const event = state.logs.find(l => l.includes('FACTS_JOB')) ?? ''
  expect(JSON.parse(event.slice(event.indexOf('FACTS_JOB') + 10)).reason).toBe(expected)
  expect(event).not.toContain('password-value')
  expect(state.calls).toBe(1)
})
test('a side response at the output cap records a bounded cause without retaining its text', { options }, async ($, on) => {
  const { state } = world(on); await start($); state.outputTokens = 2000
  state.outputs = ['do-not-retain-selector-reply']
  expect((await batch($)).additionalContext).toEqual(['host context'])
  const event = state.logs.find(l => l.includes('SIDE_CALL')) ?? ''
  const data = JSON.parse(event.slice(event.indexOf('SIDE_CALL') + 10))
  expect(data.reason).toBe('output-limit')
  expect(data.elapsedMs).toBe(0)
  expect(event).not.toContain('do-not-retain-selector-reply')
})
test('a host process failure records a service cause without putting raw errors in stage logs', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  state.processError = true
  expect((await batch($)).additionalContext).toEqual(['host context'])
  const event = state.logs.find(l => l.includes('FACTS_JOB')) ?? ''
  expect(JSON.parse(event.slice(event.indexOf('FACTS_JOB') + 10)).reason).toBe('service-error')
  expect(event).not.toContain('private-source-value')
  expect(state.calls).toBe(1)
})
test('an answered selection that uses the deadline is distinguished from an inspection rejection', { options }, async ($, on) => {
  const { state } = world(on); await start($); state.modelDelayMs = 30000
  expect((await batch($)).additionalContext).toEqual(['host context'])
  const event = state.logs.find(l => l.includes('FACTS_JOB')) ?? ''
  const data = JSON.parse(event.slice(event.indexOf('FACTS_JOB') + 10))
  expect(data.reason).toBe('deadline')
  expect(data.elapsedMs).toBe(30000)
  expect(state.reads).toBe(0)
})
