import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
const options = { assistance_mode: 'supervise', execution_mode: 'off', verifier_model: 'fixture' }
const reply = () => JSON.stringify({ reviewed: ['architecture'], judgment: { dimension: 'architecture', question: 'Should the public interface be replaced?', requirementQuote: 'Preserve the API.', sourceIds: ['req', 'plan-1'], reason: 'The proposed replacement removes the existing entry point.', impact: 'Caller compatibility.', recommendation: 'adjust', uncertainty: 'The complete caller set is unknown.' }, action: { kind: 'none' } })
const world = (on: Parameters<TestBody>[1]) => {
  mock.store(on); const clock = mock.clock(on, { now: 100000 })
  const state = { throwFollowUp: false, dropFollowUp: false, controlPath: '', control: JSON.stringify({ version: 1, revision: 0 }), calls: 0, unanswered: false, unansweredReason: 'aborted', logLimit: Infinity, nextPromptWait: undefined as Promise<void> | undefined, cwd: '/p', submitted: [] as string[], echo: true, timeouts: [] as number[], prompts: [] as string[], logs: [] as string[], processActions: [] as string[], validateDelay: 0, wait: undefined as Promise<void> | undefined, outputs: [reply(), reply()], rows: [{ role: 'assistant', text: 'Plan: replace the public method.', toolUses: [{ tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.old = () => 1' }] }] }
  on('session.id', () => ({ value: 'review-session' })); on('session.model', () => ({ value: 'fixture' })); on('session.cwd', () => ({ value: state.cwd })); on('session.messages', () => ({ value: state.rows }) as never)
  on('env.get', (_$, e) => ({ value: e.name === 'DEEPSEEK_SUPERVISOR_CONTROL_FILE' ? state.controlPath : 'on' })); on('fs.read', () => ({ value: state.control })); on('ui.status', () => ({ value: undefined })); on('ui.log', (_$, e) => { state.logs.push(e.text.slice(0, state.logLimit)); return { value: undefined } })
  on('command.register', (_$, e) => ({ value: { command: e.name } })); on('session.start', () => ({ cwd: '/p' })); on('prompt.submit', async (_$, e) => { state.submitted.push(e.text); if (state.throwFollowUp && e.text.includes('Engineering review')) throw Error('session no longer bound'); if (state.dropFollowUp && e.text.includes('Engineering review')) return { text: e.text, drop: 'unavailable' } as never; if (e.text === 'New queued task.' && state.nextPromptWait) await state.nextPromptWait; return { text: e.text } as never })
  on('classic.PostToolBatch', () => ({ additionalContext: ['host context'] }) as never); on('classic.Stop', () => ({}) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer })); on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('model.complete', async (_$, e) => { state.calls++; state.timeouts.push(e.timeoutMs ?? 0); state.prompts.push(e.prompt); if (state.wait) await state.wait; let text = state.outputs.shift() ?? 'null'; try { const context = JSON.parse(e.prompt.split('\n\n').at(-1)!); if (state.echo && context.checkpoint) text = JSON.stringify({ ...JSON.parse(text), reviewId: context.checkpoint.reviewId, checkpointId: context.checkpoint.checkpointId }) } catch {} return { value: state.unanswered ? { isAnswered: false, reason: state.unansweredReason, ...(state.unansweredReason === 'api-error' ? { status: 429, error: 'rate_limit' } : {}), usage: { input_tokens: 0, output_tokens: 0 } } : { isAnswered: true, text, usage: { input_tokens: 10, output_tokens: 20 } } } as never })
  on('process.run', async (_$, e) => {
    const request = JSON.parse(e.init?.stdin ?? '{}'); state.processActions.push(request.action)
    if (request.action === 'validate-facts' && state.validateDelay) await clock.advance(state.validateDelay)
    const value = request.action === 'inspect' ? { facts: [{ id: 'f1', path: 'api.js', startLine: 1, quote: 'exports.old = () => 1', fileHash: 'h' }], files: [{ path: 'api.js', fileHash: 'h' }], manifestHash: 'm', incomplete: false } : request.action === 'validate-facts' ? true : null
    return { value: { exitCode: 0, stdout: JSON.stringify(value), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  return { state, clock }
}
const start = async ($: Parameters<TestBody>[0]) => { await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: false }); await $.prompt.submit({ text: 'Preserve the API.', origin: { kind: 'sdk' } } as never) }
const batch = ($: Parameters<TestBody>[0]) => $.classic.PostToolBatch({ tool_calls: [] } as never) as Promise<{ additionalContext?: string[] }>

const observeBatch = async ($: Parameters<TestBody>[0], clock: ReturnType<typeof mock.clock>) => {
  const first = await batch($)
  await flushBackground(clock)
  const second = await batch($)
  await flushBackground(clock)
  return { ...second, additionalContext: [...new Set([...(first.additionalContext ?? []), ...(second.additionalContext ?? [])])] }
}
const observeStop = async ($: Parameters<TestBody>[0], clock: ReturnType<typeof mock.clock>, answer: string) => {
  const first = await $.classic.Stop({ last_assistant_message: answer } as never) as { block?: string }
  await flushBackground(clock)
  return first.block ? first : await $.classic.Stop({ last_assistant_message: answer } as never) as { block?: string }
}

test('supervise reviews an explicit plan and delivers architecture judgment without the old verifier loop', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const result = await observeBatch($, clock)
  expect(result.additionalContext?.[0]).toBe('host context')
  expect(result.additionalContext?.join('\n')).toContain('Caller compatibility')
  expect(state.calls).toBe(1)
  expect(state.prompts[0]).toContain('requirement-plan')
  expect(state.prompts[0]).toContain('counterevidence')
  await observeBatch($, clock)
  expect(state.calls).toBe(1)
})
test('an end-of-turn review offers one bounded opportunity to revise, without an endless stop loop', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const stop = () => observeStop($, clock, 'Changed the interface.')
  expect((await stop()).block).toContain('Engineering review')
  expect((await stop()).block).toBe(undefined)
  expect(state.calls).toBe(1)
})
for (const invalidate of ['prompt', 'off', 'cancel']) test(`late comprehensive review after ${invalidate} does not reach the main model`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const pending = observeBatch($, clock)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  expect(state.calls).toBe(1)
  if (invalidate === 'prompt') await $.prompt.submit({ text: 'New task.', origin: { kind: 'composer' } } as never)
  if (invalidate === 'off') await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  if (invalidate === 'cancel') await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
  release(); await flushBackground(clock); expect((await pending).additionalContext).toEqual(['host context'])
})
test('shadow records a comprehensive review without injecting it', { options: { ...options, execution_mode: 'shadow' } }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
  expect(state.logs.some(l => l.includes('REVIEW '))).toBe(true)
})

test('probe mode carries an unexecuted requirement counterexample through the host', { options: { ...options, assistance_mode: 'probe' } }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const d = JSON.parse(reply()); d.action = { kind: 'probe', candidate: { question: 'Does the public caller still work?', requirementQuote: 'Preserve the API.', command: 'node check.js', files: [], oracle: 'spec-example', oracleExplanation: 'A caller must retain its interface; unverified.', sourceIds: ['req'] } }; state.outputs = [JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain('not executed')
  expect(state.calls).toBe(1)
})
test('plan and later implementation review share two calls and cannot add a third completion call', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($); await observeBatch($, clock)
  state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Edit', input: { file_path: '/p/api.js', old_string: 'exports.old = () => 1', new_string: 'exports.new = () => 1' }, text: 'updated' }, { tool: 'Bash', input: { command: 'npm test' }, text: '1 passed' }] } as never)
  const d = JSON.parse(reply()); d.reviewed = ['plan-implementation']; d.judgment.dimension = 'plan-implementation'; d.judgment.sourceIds = ['req', 'plan-1', 'change']; state.outputs = [JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain('plan-implementation')
  await observeStop($, clock, 'Finished.')
  expect(state.calls).toBe(2)
})
test('a completion review receives the actual final claim as attributed evidence', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  await observeStop($, clock, 'The old interface is removed; callers were not tested.')
  expect(state.prompts[0]).toContain('The old interface is removed; callers were not tested.')
})
test('one source without an explicit plan waits for more exploration evidence', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($); state.rows[0]!.text = 'Reading the existing method.'
  await observeBatch($, clock); expect(state.calls).toBe(0)
})
test('overlapping identical tool batches reserve only one review', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const first = observeBatch($, clock)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  const second = observeBatch($, clock); release()
  const results = await Promise.all([first, second])
  expect(state.calls).toBe(1)
  expect(results.filter(r => r.additionalContext?.join('\n').includes('Engineering review')).length).toBe(1)
})
test('one recovery packet per prompt retains actual failures without an automatic recovery loop', { options: { ...options, assistance_mode: 'recovery' } }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const failure = { tool: 'Bash', input: { command: 'npm test' }, text: 'Error: missing fixture', isError: true }
  state.rows = [{ role: 'assistant', text: 'Plan: preserve the public method.', toolUses: [failure, failure, failure] }] as never
  const d = JSON.parse(reply()); d.reviewed = ['recovery']; d.judgment.dimension = 'recovery'; d.judgment.sourceIds = ['req', 'tool-1']; d.action = { kind: 'recovery', observationIds: ['tool-1', 'tool-2', 'tool-3'], question: 'Does this task include the fixture?' }; state.outputs = [JSON.stringify(d), JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain('One unresolved question')
  await $.classic.Stop({ last_assistant_message: 'The fixture remains missing.' } as never)
  expect(state.calls).toBe(1)
})

test('off and on cannot replenish the shared active review budget', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  const pending = observeBatch($, clock)
  for (let i = 0; i < 12 && !state.calls; i++) await clock.advance(10)
  await clock.advance(10000)
  await $.command.run({ command: 'deepseek-supervisor', args: 'off' } as never)
  release(); await pending; await flushBackground(clock); state.wait = undefined
  await $.command.run({ command: 'deepseek-supervisor', args: 'on' } as never)
  state.rows[0]!.text = 'Plan: preserve the public method with an adapter.'
  await observeBatch($, clock)
  expect(state.calls).toBe(2)
  expect(state.timeouts[1]! <= 20000).toBe(true)
})
for (const dimension of ['requirement-plan', 'direction', 'verification']) test(`${dimension} judgment has a real hook feedback path`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  if (dimension === 'verification') state.rows[0]!.toolUses.push({ tool: 'Bash', input: { command: 'npm test' }, text: '1 failed', isError: true } as never)
  const d = JSON.parse(reply()); d.reviewed = [dimension]; d.judgment.dimension = dimension
  if (dimension === 'verification') d.judgment.sourceIds = ['req', 'tool-2']
  state.outputs = [JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain(`Dimension: ${dimension}`)
  expect(state.calls).toBe(1)
})
test('a grounded continue judgment without new evidence does not interrupt the worker', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const d = JSON.parse(reply()); d.judgment.recommendation = 'continue'; state.outputs = [JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  expect(state.logs.some(l => l.includes('REVIEW_DELIVERY'))).toBe(false)
})

test('source validation time is charged before another review can start', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const d = JSON.parse(reply()); d.action = { kind: 'location', request: { paths: ['api.js'], terms: [] } }; state.outputs = [JSON.stringify(d), reply()]; state.validateDelay = 20000
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain('Supplemental verified')
  state.rows[0]!.text = 'Plan: preserve the public method through an adapter.'
  await observeBatch($, clock)
  expect(state.calls).toBe(2)
  expect(state.timeouts).toEqual([0, 0])
})
test('budget and invalid protocol skips have bounded phase-specific unreviewed diagnostics', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  state.outputs = ['not json', reply()]
  await observeBatch($, clock)
  expect(state.logs.some(l => l.includes('invalid-review-protocol'))).toBe(true)
  state.rows[0]!.text = 'Plan: preserve the public method through an adapter.'
  await observeBatch($, clock)
  await observeStop($, clock, 'Finished.')
  const skips = state.logs.filter(l => l.includes('budget-exhausted') && l.includes('completion'))
  expect(skips.length).toBe(1)
  await observeStop($, clock, 'Finished.')
  expect(state.logs.filter(l => l.includes('budget-exhausted') && l.includes('completion')).length).toBe(1)
  expect(state.calls).toBe(2)
})

for (const dimension of ['architecture', 'direction', 'exploration']) test(`${dimension} reaches the worker without an explicit plan after distinct source evidence`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  state.rows = [{ role: 'assistant', text: '', toolUses: [
    { tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.old = () => 1' },
    { tool: 'Grep', input: { pattern: 'old', path: '/p/caller.js' }, text: 'api.old()' }
  ] }] as never
  const d = JSON.parse(reply()); d.reviewed = [dimension]; d.judgment.dimension = dimension; d.judgment.sourceIds = ['req', 'tool-1', 'tool-2']; state.outputs = [JSON.stringify(d), JSON.stringify(d)]
  const response = await observeBatch($, clock)
  expect(response.additionalContext?.join('\n')).toContain(`Dimension: ${dimension}`)
  const context = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  expect(context.phase).toBe('exploration')
  expect(context.sources.some((s: { kind: string }) => s.kind === 'plan')).toBe(false)
  expect(response.additionalContext?.join('\n')).toContain('not reviewed: requirement-plan, plan-implementation')
  state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/other.js' }, text: 'other caller' }] })
  await observeBatch($, clock)
  expect(state.calls).toBe(1)
  await observeStop($, clock, 'The interface should remain compatible.')
  expect(state.calls).toBe(2)
  await observeStop($, clock, 'The interface should remain compatible.')
  expect(state.calls).toBe(2)
})
for (const unusable of ['failed', 'pending', 'running', 'truncated', 'duplicate']) test(`exploration waits when the second source is ${unusable}`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  const first = { tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.old = () => 1' }
  const second = unusable === 'failed' ? { tool: 'Read', input: { file_path: '/p/missing.js' }, text: 'No such file', isError: true } : unusable === 'pending' ? { tool: 'Read', input: { file_path: '/p/pending.js' } } : unusable === 'running' ? { tool: 'Read', input: { file_path: '/p/pending.js' }, text: 'partial source', result: { status: 'running' } } : unusable === 'truncated' ? { tool: 'Read', input: { file_path: '/p/truncated.js' }, text: 'partial source', result: { isStdoutTruncated: true } } : { ...first, text: 'reread same path, new text' }
  state.rows = [{ role: 'assistant', text: '', toolUses: [first, second] }] as never
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(0)
})

test('bounded review materials remain auditable with declared session omission even if the provider never answers', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($); state.unanswered = true
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  const inputs = state.logs.filter(l => l.includes('REVIEW_INPUT ')).map(l => JSON.parse(l.slice(l.indexOf('REVIEW_INPUT ') + 13)))
  expect(inputs.length).toBe(1)
  expect(inputs[0].context.sources[0].text).toBe('Preserve the API.')
  expect(inputs[0].context.sources.some((s: { text: string }) => s.text.includes('exports.old'))).toBe(true)
  const actual = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  delete actual.binding.sessionId
  expect(inputs[0].context).toEqual(actual)
  expect(inputs[0].omittedBindingFields).toEqual(['sessionId'])
  expect(inputs[0].modelId).toBe('fixture')
  expect(state.calls).toBe(1)
})

test('generic discovery plus a directory listing waits for source evidence without spending review budget', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  state.rows = [{ role: 'assistant', text: "I'll start by exploring the repository structure to understand the codebase.", toolUses: [{ tool: 'Bash', input: { command: 'ls /p' }, text: 'api.js caller.js' }] }] as never
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(0)
  state.rows.push({ role: 'assistant', text: '', toolUses: [
    { tool: 'Read', input: { file_path: '/p/api.js' }, text: 'exports.old = () => 1' },
    { tool: 'Read', input: { file_path: '/p/caller.js' }, text: 'api.old()' }
  ] } as never)
  const d = JSON.parse(reply()); d.judgment.sourceIds = ['req', 'tool-2', 'tool-3']; state.outputs = [JSON.stringify(d)]
  expect((await observeBatch($, clock)).additionalContext?.join('\n')).toContain('Dimension: architecture')
  expect(state.calls).toBe(1)
  const input = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  expect(input.phase).toBe('exploration')
  expect(input.sources.some((s: { kind: string }) => s.kind === 'plan')).toBe(false)
})


test('a large review input can be reconstructed after the real host log character limit', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($); state.logLimit = 10000
  state.rows[0]!.toolUses[0]!.text = 'source'.repeat(1100) + 'first-source-end'
  state.rows[0]!.toolUses.push({ tool: 'Read', input: { file_path: '/p/caller.js' }, text: 'caller'.repeat(1100) + 'second-source-end' })
  await observeBatch($, clock)
  const headLine = state.logs.find(l => l.includes('REVIEW_INPUT '))!
  const head = JSON.parse(headLine.slice(headLine.indexOf('REVIEW_INPUT ') + 13))
  let record = head
  if (head.contextEncoding === 'json-parts') {
    const parts = state.logs.filter(l => l.includes('REVIEW_INPUT_PART ')).map(l => JSON.parse(l.slice(l.indexOf('REVIEW_INPUT_PART ') + 18)))
    record = JSON.parse(parts.sort((a, b) => a.index - b.index).map(p => p.text).join(''))
    expect(parts.length).toBe(head.parts)
  }
  expect(record.context.sources.some((s: { text: string }) => s.text.includes('first-source-end'))).toBe(true)
  expect(record.context.sources.some((s: { text: string }) => s.text.includes('second-source-end'))).toBe(true)
  expect(record.context.sources[0].text).toBe('Preserve the API.')
  expect(state.calls).toBe(1)
})
for (const reason of ['aborted', 'api-error', 'empty-reply']) test(`side call diagnostics retain the typed host ${reason} outcome without inventing provider detail`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($); state.unanswered = true; state.unansweredReason = reason
  expect((await observeBatch($, clock)).additionalContext).toEqual(['host context'])
  const line = state.logs.find(l => l.includes('SIDE_CALL '))!
  const event = JSON.parse(line.slice(line.indexOf('SIDE_CALL ') + 10))
  expect(event.hostReason).toBe(reason)
  expect(event.hostStatus).toBe(reason === 'api-error' ? 429 : null)
  expect(event.hostError).toBe(reason === 'api-error' ? 'rate_limit' : null)
  expect(event.result).toBe('unknown')
  expect(state.calls).toBe(1)
})

for (const large of [false, true]) test(`review input diagnostics omit private session identity before ${large ? 'multipart' : 'short'} native logging without changing the model input`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  if (large) state.rows[0]!.toolUses[0]!.text = 'public-source '.repeat(500)
  await observeBatch($, clock)
  const headLine = state.logs.find(l => l.includes('REVIEW_INPUT '))!
  const head = JSON.parse(headLine.slice(headLine.indexOf('REVIEW_INPUT ') + 13))
  const parts = state.logs.filter(l => l.includes('REVIEW_INPUT_PART ')).map(l => JSON.parse(l.slice(l.indexOf('REVIEW_INPUT_PART ') + 18)))
  const event = head.contextEncoding === 'json-parts' ? JSON.parse(parts.sort((a, b) => a.index - b.index).map(p => p.text).join('')) : head
  expect(event.representation).toBe('session-id-omitted')
  expect(event.omittedBindingFields).toEqual(['sessionId'])
  expect(event.context.binding.sessionId).toBe(undefined)
  const actual = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  expect(actual.binding.sessionId).toBe('review-session')
  expect(event.context.sources).toEqual(actual.sources)
  expect(event.context.binding.generationId).toBe(actual.binding.generationId)
  expect(state.calls).toBe(1)
})

const flushBackground = async (clock: ReturnType<typeof mock.clock>) => { for (let i = 0; i < 45; i++) await clock.advance(0) }
test('background review does not block a tool batch and waiting beyond thirty seconds preserves historical advice', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await flushBackground(clock); expect(state.calls).toBe(1)
  expect(state.timeouts).toEqual([0])
  const input = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  expect(input.checkpoint.sourceIds).toContain('req')
  await clock.advance(90000)
  state.rows.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/new.js' }, text: 'new code' }] })
  expect((await batch($)).additionalContext).toEqual(['host context'])
  release(); await flushBackground(clock)
  const delivered = (await batch($)).additionalContext?.join('\n')
  expect(delivered).toContain('Caller compatibility')
  expect(delivered).toContain('checkpoint')
  expect(delivered).toContain('current applicability is unknown')
  expect(state.calls).toBe(1)
  expect(state.processActions).toEqual([])
  expect((await batch($)).additionalContext).toEqual(['host context'])
})
test('a live session may receive one late followup without making plugin feedback a new task', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  await batch($); await flushBackground(clock)
  const stop = await $.classic.Stop({ last_assistant_message: 'Finished for now.' } as never) as { block?: string }
  expect(stop.block).toBe(undefined)
  await $.turn.complete({ answer: 'Finished for now.', reason: 'answer', turnId: 't', durationMs: 1, isAborted: false } as never)
  release(); await flushBackground(clock)
  expect(state.submitted.filter(t => t.includes('Engineering review')).length).toBe(1)
  await $.turn.complete({ answer: 'Considered.', reason: 'answer', turnId: 't2', durationMs: 1, isAborted: false } as never)
  await flushBackground(clock)
  expect(state.submitted.filter(t => t.includes('Engineering review')).length).toBe(1)
  await observeStop($, clock, 'Considered the historical review.')
  await flushBackground(clock)
  expect(state.calls).toBe(1)
})

for (const change of ['project', 'reload', 'end']) test(`background advice is cancelled on ${change} instead of leaking into another lifetime`, { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let release = () => {}; state.wait = new Promise<void>(r => { release = r })
  await batch($); await flushBackground(clock)
  if (change === 'project') state.cwd = '/different-project'
  if (change === 'reload') await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: false })
  if (change === 'end') await $.session.end({ sessionId: 'review-session' } as never)
  release(); await flushBackground(clock)
  expect(state.logs.filter(l => l.includes('REVIEW_DELIVERY') && !l.includes('dropped')).length).toBe(0)
  expect(state.submitted.filter(t => t.includes('Engineering review')).length).toBe(0)
})
test('a checkpoint identifies the last included tool rather than a later omitted tool', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  state.rows[0]!.toolUses.push({ tool: 'Read', input: { file_path: '/p/too-large.js' }, text: 'x'.repeat(10000) })
  await observeBatch($, clock)
  const context = JSON.parse(state.prompts[0]!.split('\n\n').at(-1)!)
  expect(context.checkpoint.lastTool.path).toBe('api.js')
})

test('new human input cancels old work before the host finishes accepting its queued prompt', { options }, async ($, on) => {
  const { state, clock } = world(on); await start($)
  let reply = () => {}, accept = () => {}
  state.wait = new Promise<void>(r => { reply = r })
  await batch($); await flushBackground(clock)
  state.nextPromptWait = new Promise<void>(r => { accept = r })
  const next = $.prompt.submit({ text: 'New queued task.', origin: { kind: 'sdk' } } as never)
  await flushBackground(clock); reply(); await flushBackground(clock)
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
  accept(); await next
})

test('headless input notification cancels a pending review before native prompt admission', { options }, async ($, on) => {
  const { state, clock } = world(on)
  state.controlPath = '/private/review-control'
  await start($)
  let release = () => {}; state.wait = new Promise<void>(resolve => { release = resolve })
  await batch($); await flushBackground(clock)
  expect(state.calls).toBe(1)
  state.control = JSON.stringify({ version: 1, revision: 1 })
  await clock.advance(200); await flushBackground(clock)
  expect(state.logs.some(line => line.includes('REVIEW_CONTROL') && line.includes('"revision":1') && line.includes('"status":"cancelled"'))).toBe(true)
  release(); await flushBackground(clock)
  expect((await batch($)).additionalContext).toEqual(['host context'])
  await observeStop($, clock, 'Old main completed.')
  expect(state.calls).toBe(1)
  expect(state.submitted.filter(text => text.includes('Engineering review')).length).toBe(0)
  // Only actual native admission of the new user prompt opens its new budget.
  state.wait = undefined
  await $.prompt.submit({ text: 'Preserve the API.', origin: { kind: 'sdk' } } as never)
  await observeBatch($, clock)
  expect(state.calls).toBe(2)
})

test('an unreadable configured input channel drops old feedback without authorizing replacement work', { options }, async ($, on) => {
  const { state, clock } = world(on)
  state.controlPath = '/private/review-control'
  await start($)
  let release = () => {}; state.wait = new Promise<void>(resolve => { release = resolve })
  await batch($); await flushBackground(clock)
  state.control = 'broken'
  await clock.advance(200); await flushBackground(clock)
  release(); await flushBackground(clock)
  expect((await batch($)).additionalContext).toEqual(['host context'])
  expect(state.calls).toBe(1)
  expect(state.logs.some(line => line.includes('REVIEW_CONTROL') && line.includes('"status":"unavailable"'))).toBe(true)
})

for (const rejection of ['drop', 'throw']) test(`a late followup ${rejection} consumes its attempt but creates no expected native result`, { options }, async ($, on) => {
  const { state, clock } = world(on); state.dropFollowUp = rejection === 'drop'; state.throwFollowUp = rejection === 'throw'
  await start($)
  let release = () => {}; state.wait = new Promise<void>(resolve => { release = resolve })
  await batch($); await flushBackground(clock)
  await $.turn.complete({ answer: 'Finished.', reason: 'answer', turnId: 't', durationMs: 1, isAborted: false } as never)
  release(); await flushBackground(clock)
  const terminal = state.logs.filter(line => line.includes('REVIEW_LIFECYCLE')).at(-1) ?? ''
  expect(terminal).toContain('"acceptedFollowUps":0')
  expect(state.submitted.filter(text => text.includes('Engineering review')).length).toBe(1)
  await observeStop($, clock, 'Finished again.'); await flushBackground(clock)
  expect(state.submitted.filter(text => text.includes('Engineering review')).length).toBe(1)
})

test('a main tool in progress makes old review actions historical before PostToolBatch', { options }, async ($, on) => {
  const { state, clock } = world(on)
  const decision = JSON.parse(reply())
  decision.action = { kind: 'location', request: { paths: ['api.js'], terms: [] } }
  state.outputs = [JSON.stringify(decision)]
  let finishTool = () => {}
  const toolRunning = new Promise<void>(resolve => { finishTool = resolve })
  on('tool.call', async () => { await toolRunning; return { result: 'updated' } as never })
  await start($)
  let release = () => {}; state.wait = new Promise<void>(resolve => { release = resolve })
  await batch($); await flushBackground(clock)
  const editing = $.tool.call({ tool: 'Edit', input: { file_path: '/p/api.js', old_string: 'old', new_string: 'new' } } as never)
  await flushBackground(clock)
  release(); await flushBackground(clock)
  expect(state.processActions.filter(action => action === 'inspect').length).toBe(0)
  finishTool(); await editing
  expect((await batch($)).additionalContext?.join('\n')).toContain('Historical advice only')
})
