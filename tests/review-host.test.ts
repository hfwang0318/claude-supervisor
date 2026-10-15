import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
const options = { assistance_mode: 'supervise', execution_mode: 'off', verifier_model: 'fixture' }
const reply = () => JSON.stringify({ reviewed: ['architecture'], judgment: { dimension: 'architecture', question: 'Should the public interface be replaced?', requirementQuote: 'Preserve the API.', sourceIds: ['req', 'plan-1'], reason: 'The proposed replacement removes the existing entry point.', impact: 'Caller compatibility.', recommendation: 'adjust', uncertainty: 'The complete caller set is unknown.' }, action: { kind: 'none' } })
const world = (on: Parameters<TestBody>[1]) => {
  mock.store(on); const clock = mock.clock(on, { now: 100000 })
  const state = { calls: 0, timeouts: [] as number[], prompts: [] as string[], logs: [] as string[], wait: undefined as Promise<void> | undefined, outputs: [reply(), reply()], rows: [{ role: 'assistant', text: 'Plan: replace the public method.', toolUses: [{ tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.old = () => 1' }] }] }
  on('session.id', () => ({ value: 'review-session' })); on('session.model', () => ({ value: 'fixture' })); on('session.cwd', () => ({ value: '/p' })); on('session.messages', () => ({ value: state.rows }) as never)
  on('env.get', () => ({ value: 'on' })); on('ui.status', () => ({ value: undefined })); on('ui.log', (_$, e) => { state.logs.push(e.text); return { value: undefined } })
  on('command.register', (_$, e) => ({ value: { command: e.name } })); on('session.start', () => ({ cwd: '/p' })); on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('classic.PostToolBatch', () => ({ additionalContext: ['host context'] }) as never); on('classic.Stop', () => ({}) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', async (_$, e) => { state.calls++; state.timeouts.push(e.timeoutMs ?? 0); state.prompts.push(e.prompt); if (state.wait) await state.wait; return { value: { isAnswered: true, text: state.outputs.shift() ?? 'null', usage: { input_tokens: 10, output_tokens: 20 } } } as never })
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'null', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never)
  return { state, clock }
}
const start = async ($: Parameters<TestBody>[0]) => { await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: false }); await $.prompt.submit({ text: 'Preserve the API.', origin: { kind: 'sdk' } } as never) }
const batch = ($: Parameters<TestBody>[0]) => $.classic.PostToolBatch({ tool_calls: [] } as never) as Promise<{ additionalContext?: string[] }>

test('supervise reviews an explicit plan and delivers architecture judgment without the old verifier loop', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  const result = await batch($)
  expect(result.additionalContext?.[0]).toBe('host context')
  expect(result.additionalContext?.join('\n')).toContain('Caller compatibility')
  expect(state.calls).toBe(1)
  expect(state.prompts[0]).toContain('requirement-plan')
  expect(state.prompts[0]).toContain('counterevidence')
  await batch($)
  expect(state.calls).toBe(1)
})
test('an end-of-turn review offers one bounded opportunity to revise, without an endless stop loop', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  const stop = () => $.classic.Stop({ last_assistant_message: 'Changed the interface.' } as never) as Promise<{ block?: string }>
  expect((await stop()).block).toContain('Engineering review')
  expect((await stop()).block).toBe(undefined)
  expect(state.calls).toBe(1)
})
for (const invalidate of ['prompt', 'off', 'cancel']) test(`late comprehensive review after ${invalidate} does not reach the main model`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const pending = batch($)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  expect(state.calls).toBe(1)
  if (invalidate === 'prompt') await $.prompt.submit({ text: 'New task.', origin: { kind: 'composer' } } as never)
  if (invalidate === 'off') await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  if (invalidate === 'cancel') await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
  release(); expect((await pending).additionalContext).toEqual(['host context'])
})
test('shadow records a comprehensive review without injecting it', { options: { ...options, execution_mode: 'shadow' } }, async ($, on) => {
  const { state } = world(on); await start($)
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
  expect(state.logs.some(l => l.includes('REVIEW '))).toBe(true)
})

test('probe mode carries an unexecuted requirement counterexample through the host', { options: { ...options, assistance_mode: 'probe' } }, async ($, on) => {
  const { state } = world(on); await start($)
  const d = JSON.parse(reply()); d.action = { kind: 'probe', candidate: { question: 'Does the public caller still work?', requirementQuote: 'Preserve the API.', command: 'node check.js', files: [], oracle: 'spec-example', oracleExplanation: 'A caller must retain its interface; unverified.', sourceIds: ['req'] } }; state.outputs = [JSON.stringify(d)]
  expect((await batch($)).additionalContext?.join('\n')).toContain('not executed')
  expect(state.calls).toBe(1)
})
test('plan and later implementation review share two calls and cannot add a third completion call', { options }, async ($, on) => {
  const { state } = world(on); await start($); await batch($)
  state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Edit', input: { file_path: '/p/api.js', old_string: 'exports.old = () => 1', new_string: 'exports.new = () => 1' }, text: 'updated' }, { tool: 'Bash', input: { command: 'npm test' }, text: '1 passed' }] } as never)
  const d = JSON.parse(reply()); d.reviewed = ['plan-implementation']; d.judgment.dimension = 'plan-implementation'; d.judgment.sourceIds = ['req', 'plan-1', 'change']; state.outputs = [JSON.stringify(d)]
  expect((await batch($)).additionalContext?.join('\n')).toContain('plan-implementation')
  await $.classic.Stop({ last_assistant_message: 'Finished.' } as never)
  expect(state.calls).toBe(2)
})
test('a completion review receives the actual final claim as attributed evidence', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  await $.classic.Stop({ last_assistant_message: 'The old interface is removed; callers were not tested.' } as never)
  expect(state.prompts[0]).toContain('The old interface is removed; callers were not tested.')
})
test('no explicit plan defers review until substantive implementation or completion', { options }, async ($, on) => {
  const { state } = world(on); await start($); state.rows[0]!.text = 'Reading the existing method.'
  await batch($); expect(state.calls).toBe(0)
})
test('overlapping identical tool batches reserve only one review', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const first = batch($)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  const second = batch($); release()
  const results = await Promise.all([first, second])
  expect(state.calls).toBe(1)
  expect(results.filter(r => r.additionalContext?.join('\n').includes('Engineering review')).length).toBe(1)
})
test('new workspace tool records invalidate an in-flight plan judgment', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const pending = batch($)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/new.js' }, text: 'changed source' }] })
  await batch($); release()
  expect((await pending).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
})
test('one recovery packet per prompt retains actual failures without an automatic recovery loop', { options: { ...options, assistance_mode: 'recovery' } }, async ($, on) => {
  const { state } = world(on); await start($)
  const failure = { tool: 'Bash', input: { command: 'npm test' }, text: 'Error: missing fixture', isError: true }
  state.rows = [{ role: 'assistant', text: 'Plan: preserve the public method.', toolUses: [failure, failure, failure] }] as never
  const d = JSON.parse(reply()); d.reviewed = ['recovery']; d.judgment.dimension = 'recovery'; d.judgment.sourceIds = ['req', 'tool-1']; d.action = { kind: 'recovery', observationIds: ['tool-1', 'tool-2', 'tool-3'], question: 'Does this task include the fixture?' }; state.outputs = [JSON.stringify(d), JSON.stringify(d)]
  expect((await batch($)).additionalContext?.join('\n')).toContain('One unresolved question')
  await $.classic.Stop({ last_assistant_message: 'The fixture remains missing.' } as never)
  expect(state.calls).toBe(1)
})

test('off and on cannot replenish the shared active review budget', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const pending = batch($)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  await clock.advance(10000)
  await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  release(); await pending; state.wait = undefined
  await $.command.run({ command: 'deepseek-supervisor', args: 'on' } as never)
  state.rows[0]!.text = 'Plan: preserve the public method with an adapter.'
  await batch($)
  expect(state.calls).toBe(2)
  expect(state.timeouts[1]! <= 20000).toBe(true)
})
for (const dimension of ['requirement-plan', 'direction', 'verification']) test(`${dimension} judgment has a real hook feedback path`, { options }, async ($, on) => {
  const { state } = world(on); await start($)
  if (dimension === 'verification') state.rows[0]!.toolUses.push({ tool: 'Bash', input: { command: 'npm test' }, text: '1 failed', isError: true } as never)
  const d = JSON.parse(reply()); d.reviewed = [dimension]; d.judgment.dimension = dimension
  if (dimension === 'verification') d.judgment.sourceIds = ['req', 'tool-2']
  state.outputs = [JSON.stringify(d)]
  expect((await batch($)).additionalContext?.join('\n')).toContain(`Dimension: ${dimension}`)
  expect(state.calls).toBe(1)
})
test('a grounded continue judgment without new evidence does not interrupt the worker', { options }, async ($, on) => {
  const { state } = world(on); await start($)
  const d = JSON.parse(reply()); d.judgment.recommendation = 'continue'; state.outputs = [JSON.stringify(d)]
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.logs.some(l => l.includes('REVIEW_DELIVERY'))).toBe(false)
})
