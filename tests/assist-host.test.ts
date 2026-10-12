import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
const usage = { input_tokens: 30, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const options = { assistance_mode: 'facts', execution_mode: 'off', verifier_model: 'fixture' }
const view = { facts: [{ id: 'f1', path: 'app.cjs', startLine: 1, quote: 'exports.day = require("./utils.cjs").parseDate', fileHash: 'a'.repeat(64) }], files: [{ path: 'app.cjs', fileHash: 'a'.repeat(64) }], manifestHash: 'b'.repeat(64), incomplete: false }
const packet = JSON.stringify({ kind: 'location', question: 'Where is parseDate loaded?', requirementQuote: 'Fix parseDate', factIds: ['f1'], observationIds: [], explanation: 'The candidate may not be the entry used.', nextCheck: null, requiresMainJudgment: true })
const world = (on: Parameters<TestBody>[1]) => {
  mock.store(on)
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 12) })
  const state = { calls: 0, reads: 0, validations: 0, valid: true, incomplete: false, outputs: ['{"paths":["app.cjs"],"terms":["parseDate"]}', packet], wait: undefined as Promise<void> | undefined, rows: [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/util.cjs' }, text: 'exports.parseDate = s => Number(s.slice(-2))' }] }] }
  on('session.id', () => ({ value: 'facts-session' }))
  on('session.model', () => ({ value: 'fixture' }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.messages', () => ({ value: state.rows }) as never)
  on('env.get', () => ({ value: 'on' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/p' }))
  on('classic.PostToolBatch', () => ({ additionalContext: ['host context'] }) as never)
  on('classic.Stop', () => ({}) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    const request = JSON.parse(e.init?.stdin ?? '{}')
    let result: unknown
    if (request.action === 'inspect') { state.reads++; result = { ...view, incomplete: state.incomplete } }
    else if (request.action === 'validate-facts') { state.validations++; result = state.valid }
    else throw Error('facts mode must never capture or execute')
    return { value: { exitCode: 0, stdout: JSON.stringify(result), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('model.complete', async () => {
    state.calls++
    const text = state.outputs.shift() ?? 'invalid'
    if (state.calls === 2 && state.wait) await state.wait
    return { value: { isAnswered: true, text, usage } } as never
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
