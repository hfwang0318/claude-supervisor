import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Issue, Reading, Track } from '../types'
import type { Binding, ExecutionEvidence, AssistInput, AssistPacket, FactView } from '../supervisor/contracts'
import { validateObservation, normalizeTrack } from '../supervisor/ledger'
import { captureSnapshot } from '../supervisor/workspace'
import { buildAssistPacket, buildLocalAssistPacket, parseFactRequest, assistSignal, assistNote, localFactRequest } from '../supervisor/assist'
import { IncrementalReview, observeStream } from '../supervisor/incremental'
import type { ReviewOpportunity } from '../supervisor/incremental'
import { Coordinator, sameBinding, sameTask } from '../supervisor/coordinator'
import { buildReviewContext, buildIncrementalContext, incrementalLastTool, parseReview, reviewPrompt, reviewInputLogs, REVIEW_DIMENSIONS, hasExplorationEvidence, reviewPhaseMatches } from '../supervisor/review'
import { runHistoricalReviewFlow, historicalReviewOutcome } from '../supervisor/review-flow'
import type { ReviewOutcome } from '../supervisor/review-flow'
import type { ReviewContext, ReviewReply } from '../supervisor/contracts'
import { recoveryObservations } from '../supervisor/recovery'
import { selectSideModel, createHost, reviewCompletionProfile } from './host'
import { registerBand } from './band'
import { HISTORY as READINGS_KEPT, readingOf } from './weather'
import type { Finding, Kind } from './evidence'
import { changesOf, contradictions, evidenceOf, isCheckClaim, isCheckCommand, isCheckKind, isClaim, keyOf, recordFindings, reviewChangesOf, settledBy, skipped, supports, unreported } from './evidence'
import type { Facts, Mode, VerifyInput, VerifyResult } from './prompt'
import { assistPacketPrompt, localPacketPrompt, factRequestPrompt, base, bytesOf, claimsOf, clip,  factsOf, isSameItem, noteText, parseTurn, probeRefusal, redact, refusal, ROUNDS, shown, squash, verifyPrompt } from './prompt'

// Claude Code's own "You should know" is hidden whenever ANTHROPIC_BASE_URL points
// away from Anthropic (observed on 2.1.290: that one variable alone), so it never
// loads on a third-party model. This is not a copy of it. A weaker model goes wrong
// in ways the session's own record shows, and in ways only running something shows:
//
// - after every batch of tool calls, rules on the record (evidence.ts) look for the
//   model going in circles, editing against a stale view of a file, bending a test,
//   or touching what the person said not to; what they find rides into the next
//   request with the tool results;
// - before a turn ends, the same rules hold the answer to the record (a pass claimed
//   over a failed or stale run, a failure left unsaid); what does not hold keeps the
//   turn going, at most twice per prompt of the person's, the second time only with
//   what the first did not say;
// - an explicitly configured side model no stronger than the worker, checks the
//   model's claims by running commands in a throwaway copy, and reads the turn's
//   change for a defect it can show with a command (see prompt.ts).

// Cheap record rules continue at every batch; semantic checks are opt-in and
// share finite per-prompt reservations; incremental defaults are configurable.
const MIN_GAP = 3
const CLAIMS_PER_RUN = 12
const SEEN_KEPT = 200
// A turn whose answer does not hold is kept going at most twice per prompt of the
// person's (the second time only with what is new), and a verifier that finds
// something after the turn ended sends at most one follow-up prompt: a check can never
// keep a session going by itself.
const BLOCKS_PER_PROMPT = 2
const FOLLOW_UPS_PER_PROMPT = 1
// "You should know" cards clear after two prompts from the person; so does the band.
const CLEAR_AFTER_PROMPTS = 2
// How long the verifier may take: where a turn's end waits on it, a minute; elsewhere,
// off anyone's path, three.
const ISSUES_KEPT = 40
const HISTORY = 50

// The band's two values, drawn by hooks/band.tsx. The scan wants every file that
// writes one to name it in a const of its own; types/index.d.ts holds both to one shape.
const cards = atom({ plugin: 'deepseek-supervisor', key: 'cards' } as const, null)
const isHidden = atom({ plugin: 'deepseek-supervisor', key: 'isHidden' } as const, false)
// The numbered items. In $.state, not a module variable, so a hot reload neither
// forgets what the model was told nor reuses an id.
const EMPTY: Track = { schemaVersion: 2, nextId: 1, issues: [], seen: [], runs: 0 }
const track = atom({ plugin: 'deepseek-supervisor', key: 'track' } as const, EMPTY)

type Config = { reviewSchedule: 'incremental' | 'legacy' | null; reviewInterval: number; reviewMaxCalls: number; reviewOutputBudget: number; reviewPolicyValid: boolean; reviewPhase: 'auto' | ReviewContext['phase'] | null; verifierModel: string; reviewChanges: boolean; executionMode: 'off' | 'shadow' | 'enabled'; assistanceMode: 'existing' | 'facts' | 'supervise' | 'probe' | 'recovery' }
const reviewOption = (options: PluginOptions | undefined, key: string) => (options as Record<string, unknown> | undefined)?.[key]
const integerOption = (options: PluginOptions | undefined, key: string, fallback: number, max: number) => {
  const value = reviewOption(options, key)
  if (value === undefined) return fallback
  const number = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(number) && number <= max ? number : 0
}
const configOf = (options: PluginOptions | undefined): Config => ({
  reviewSchedule: reviewOption(options, 'review_schedule') === undefined || reviewOption(options, 'review_schedule') === 'incremental' ? 'incremental' : reviewOption(options, 'review_schedule') === 'legacy' ? 'legacy' : null,
  reviewInterval: integerOption(options, 'review_interval', 5, 100) || 5,
  reviewMaxCalls: integerOption(options, 'review_max_calls', 3, 100) || 3,
  reviewOutputBudget: integerOption(options, 'review_output_budget', 12000, 1000000) || 12000,
  reviewPolicyValid: integerOption(options, 'review_interval', 5, 100) > 0 && integerOption(options, 'review_max_calls', 3, 100) > 0 && integerOption(options, 'review_output_budget', 12000, 1000000) > 0,
  reviewPhase: options?.review_phase === undefined ? 'auto' : ['auto', 'plan', 'exploration', 'implementation', 'failure', 'completion'].includes(options.review_phase as string) ? options.review_phase as 'auto' | ReviewContext['phase'] : null,
  // Empty means follow the host's current worker; no capability ranking applies.
  verifierModel: typeof options?.verifier_model === 'string' ? options.verifier_model.trim() : '',
  assistanceMode: options?.assistance_mode === 'facts' || options?.assistance_mode === 'supervise' || options?.assistance_mode === 'probe' || options?.assistance_mode === 'recovery' ? options.assistance_mode : 'existing',
  reviewChanges: options?.review_changes !== false,
  executionMode: options?.execution_mode === 'enabled' || options?.execution_mode === 'shadow' ? options.execution_mode : 'off',
})

const say = ($: EngineInterface, line: string) => $.ui.log(`deepseek-supervisor: ${line}`, { to: 'debug' })

// `on` and `off` are what the person chose, with the command or DEEPSEEK_SUPERVISOR;
// with neither, it runs where the built-in one is hidden: ANTHROPIC_BASE_URL set to
// a host that is not Anthropic's.
type Setting = 'auto' | 'on' | 'off'
const settingOf = async ($: EngineInterface): Promise<Setting> => {
  const v = await $.store.get('mode').catch(() => undefined)
  if (v === 'on' || v === 'off') return v
  const env = (await $.env.get('DEEPSEEK_SUPERVISOR').catch(() => undefined))?.trim().toLowerCase()
  return env === 'on' || env === 'off' ? env : 'auto'
}

const isAnthropic = (url: string | undefined) => {
  if (url === undefined || url.trim() === '') return true
  const host = /^[a-z]+:\/\/([^/:?#]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? ''
  return host === 'anthropic.com' || host.endsWith('.anthropic.com')
}

const onAnthropic = async ($: EngineInterface) => isAnthropic(await $.env.get('ANTHROPIC_BASE_URL').catch(() => undefined))

const isOn = async ($: EngineInterface) => {
  const setting = await settingOf($)
  return setting === 'auto' ? !(await onAnthropic($)) : setting === 'on'
}

type Runtime = {
  acceptedReviewFollowUps: number; steps: number; isBusy: boolean; promptsSinceCards: number; blocks: number
  held: Set<number>; followUps: number; turnFrom: number; isInteractive: boolean
  asked: string; told: number; last: string; coordinator: Coordinator
  jobNumber: number; modelDisabled: boolean; cfg: Config; stateUsable: boolean; journal: Promise<unknown>; recordEnd: number; workerModel: string | null; factsAttempted: boolean
  reviewSignatures: Set<string>; reviewAttempts: number; reviewStopSent: boolean; reviewRecoveryUsed: boolean; reviewSkipKeys: Set<string>
  reviewPending?: { binding: Binding; token: number }; reviewReady?: PreparedReview; reviewDraining?: { binding: Binding }; reviewInputPending?: string; reviewSequence: number; mainActive: boolean; reviewCwd: string
  reviewWorkspace?: { root: string; gitDirectory: string } | null; reviewProjectPending?: Promise<void>
  incremental: IncrementalReview<ReviewFrame>; firstWrite: boolean; publicStep?: { key: string; text: string; binding: Binding; truncated?: boolean; capturedText?: string };
  reviewControl?: { path: string; revision: number; busy: boolean; timer?: ReturnType<EngineInterface['clock']['every']> }
}
const sessions = new Map<string, Runtime>()
const runtimeOf = async ($: EngineInterface): Promise<Runtime> => {
  const sessionId = await $.session.id().catch(() => '')
  let s = sessions.get(sessionId)
  if (s) return s
  const binding: Binding = { sessionId, generationId: String(await $.clock.now()), turnId: 'initial', taskRevision: 0, workspaceRevision: 'unknown', snapshotId: 'unknown' }
  s = { incremental: new IncrementalReview(), firstWrite: false, acceptedReviewFollowUps: 0, steps: 0, isBusy: false, promptsSinceCards: 0, blocks: 0, held: new Set(), followUps: 0, turnFrom: 0, isInteractive: true, asked: '', told: 0, last: '', coordinator: new Coordinator(binding), jobNumber: 0, modelDisabled: false, cfg: configOf(undefined), stateUsable: true, journal: Promise.resolve(), recordEnd: 0, workerModel: null, factsAttempted: false, reviewSignatures: new Set(), reviewAttempts: 0, reviewStopSent: false, reviewRecoveryUsed: false, reviewSkipKeys: new Set(), reviewSequence: 0, mainActive: true, reviewCwd: '' }
  sessions.set(sessionId, s)
  return s
}

const selectionOf = async ($: EngineInterface) => {
  const s = await runtimeOf($)
  const workerId = await $.session.model().catch(() => '')
  if (s.workerModel !== null && s.workerModel !== workerId) {
    s.coordinator.invalidate({ ...s.coordinator.binding, generationId: `model-${await $.clock.now()}-${++s.jobNumber}` }, { preserveBudget: true, now: await $.clock.now() })
    s.modelDisabled = false
  }
  s.workerModel = workerId
  return selectSideModel(s.cfg.verifierModel, workerId)
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const show = async ($: EngineInterface) => {
  const s = await runtimeOf($)
  if (!(await isOn($)))
    return $.ui.status(
      (await settingOf($)) === 'off'
        ? 'deepseek-supervisor is off (/deepseek-supervisor on)'
        : 'deepseek-supervisor idle: Anthropic endpoint, where the built-in "You should know" runs (/deepseek-supervisor on to force)',
    )
  if (!s.stateUsable) return $.ui.status('deepseek-supervisor unknown state schema; supervision disabled; original state preserved')
  const open = (await read($, track)).issues.filter(i => i.status === 'open').length
  const selection = await selectionOf($)
  $.ui.status(`deepseek-supervisor ${selection.modelId !== null && !s.modelDisabled ? 'checking' : 'rules-only'} · ${s.told} noted` + (open === 0 ? '' : ` (${open} open)`) + (s.last === '' ? '' : ` · last: ${s.last}`))
}

// The context window's fill, for the line above the prompt (weather.tsx, drawn in
// band.tsx). Taken when a session starts and when a main-loop turn ends; a host
// that reports no usage leaves the line out and never breaks the check.
const readings = atom({ plugin: 'deepseek-supervisor', key: 'readings' } as const, [] as Reading[])
const takeReading = async ($: EngineInterface) => {
  const reading = readingOf((await $.session.usage().catch(() => undefined))?.context)
  if (reading !== undefined) await update($, readings, h => [...(h ?? []), reading].slice(-READINGS_KEPT)).catch(() => undefined)
}

const remember = async ($: EngineInterface, entry: Record<string, unknown>) => {
  const s = await runtimeOf($)
  const write = async () => {
    const old = await $.store.get('history').catch(() => [])
    const list = Array.isArray(old) ? old : []
    await $.store.set('history', [...list, { schemaVersion: 2, ...entry }].slice(-HISTORY))
  }
  const result = s.journal.then(write, write)
  s.journal = result.catch(() => undefined)
  await result.catch(err => say($, `diagnostic persistence failed: ${redact(String(err))}`))
}

// The verifier's loop: the model proposes commands, they run in a copy, their
// output goes back, until it answers. A loop of its own, not a subagent: every
// command passes through here (where it runs, what it may touch, what it cost),
// nothing lands in the conversation but the note, and every wait is a `$` call,
// so a hook that waits on it keeps its 10 s budget.
const service = async ($: EngineInterface, request: Record<string, unknown>, deadlineMs: number, signal?: AbortSignal): Promise<unknown> => {
  const s = await runtimeOf($)
  if (signal?.aborted && request.action !== 'cleanup') throw Error('cancelled job')
  const timeoutMs = Math.max(1, deadlineMs - await $.clock.now())
  // Capture/manifest/cleanup contain no project execution and are time bounded.
  if (request.action !== 'execute') {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/supervisor-host.mjs`], { stdin: JSON.stringify(request), timeoutMs })
    if (r.exitCode !== 0 || r.isStdoutTruncated || r.isStderrTruncated) throw Error('snapshot service unavailable')
    return JSON.parse(r.stdout)
  }
  const stream = $.process.spawn({ argv: ['node', `${$.plugin.root}/scripts/supervisor-host.mjs`], input: JSON.stringify(request) })
  let output = ''
  let stop: (() => void) | undefined
  const stopped = new Promise<null>(resolve => { stop = () => resolve(null); signal?.addEventListener('abort', stop, { once: true }) })
  try {
    while (true) {
      const chunk = await Promise.race([stream.next(), stopped])
      if (chunk === null) throw Error('cancelled job')
      if (chunk.done) break
      if (chunk.value.stream === 'stdout') output += chunk.value.text
      if (output.length > 4 * 1024 * 1024) throw Error('service output limit')
    }
    return JSON.parse(output)
  } finally {
    if (stop) signal?.removeEventListener('abort', stop)
    await stream.return({ code: null, signal: 'SIGTERM' })
  }
}

const hostOf = ($: EngineInterface, signal?: AbortSignal) => createHost({
  now: () => $.clock.now(), cwd: () => $.session.cwd(),
  identity: async () => ({ sessionId: await $.session.id(), workerId: await $.session.model() }),
  service: (request, deadlineMs) => service($, request, deadlineMs, signal),
  persist: (key, value) => $.store.set(key, value),
  deliver: async (_id, text) => { const r = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }); return r.deny ? 'dropped' : 'delivered' },
  sanitize: redact,
})

const addCost = (cost: VerifyResult['cost'], u: { cache_read_input_tokens?: number | null; input_tokens: number; output_tokens: number }) => {
  cost.cached += u.cache_read_input_tokens ?? 0
  cost.input += u.input_tokens
  cost.output += u.output_tokens
  cost.calls += 1
}

// Resolve the chosen model for this call. Provider refusal never selects another model.
const ask = async ($: EngineInterface, prompt: string, timeoutMs = 30000, jobSignal?: AbortSignal) => {
  const s = await runtimeOf($)
  const selection = await selectionOf($)
  if (selection.modelId === null || s.modelDisabled || jobSignal?.aborted || bytesOf(prompt) > 65536) return undefined
  const callBinding = { ...s.coordinator.binding }
  const historical = s.coordinator.historical
  const hostVersion = historical ? await $.session.version().then(v => v.version).catch(() => '') : ''
  const profile = historical ? reviewCompletionProfile(hostVersion, selection.modelId) : null
  if (jobSignal?.aborted || !s.coordinator.matches(callBinding) || sessions.get(callBinding.sessionId) !== s) return undefined
  if (historical && !profile) {
    say($, `SIDE_BUDGET ${JSON.stringify({ reason: 'unverified-output-cap', hostVersion, modelId: selection.modelId })}`)
    return undefined
  }
  const admissionAt = await $.clock.now()
  if (jobSignal?.aborted || !s.coordinator.matches(callBinding)) return undefined
  const budget = s.coordinator.reserveCall(admissionAt, profile?.maxTokens ?? 2000, profile?.outputAllowance ?? 0)
  if (!budget) return undefined
  const startedAt = await $.clock.now()
  const modelTimeout = budget.timeoutMs === undefined ? undefined : Math.min(timeoutMs, budget.timeoutMs)
  s.coordinator.pauseModel(callBinding, startedAt)
  const reply = await $.model.complete({ model: selection.modelId, prompt: redact(prompt), maxTokens: budget.maxTokens, ...(profile ? { effort: profile.effort } : {}), ...(modelTimeout === undefined ? {} : { timeoutMs: modelTimeout }) }, jobSignal ? { signal: jobSignal } : undefined).catch((err: unknown) => {
    say($, `configured side model unavailable: ${String(err)}`)
    return undefined
  })
  if (sessions.get(callBinding.sessionId) !== s) return undefined
  s.coordinator.resumeModel(callBinding, await $.clock.now())
  const elapsedMs = Math.max(0, await $.clock.now() - startedAt)
  // Usage above the public request is possible on this host and is not a stop reason.
  const accountingCurrent = s.coordinator.matches(callBinding)
  const usageWithinReservation = !reply || !accountingCurrent || s.coordinator.recordUsage(reply.usage.output_tokens, budget.reservedTokens)
  const budgetDiagnostic = { requestedOutput: budget.maxTokens, wireOutput: profile ? budget.reservedTokens : null, reservedOutput: budget.reservedTokens, capProfile: profile?.id ?? null, effort: profile?.effort ?? null, hostVersion: hostVersion || null, providerStopReason: null, usageWithinReservation: reply && accountingCurrent ? usageWithinReservation : null }
  const hostFailure = reply && !reply.isAnswered ? reply : null
  const hostDiagnostic = { hostReason: hostFailure?.reason ?? null, hostStatus: hostFailure?.reason === 'api-error' ? hostFailure.status : null, hostError: hostFailure?.reason === 'api-error' ? hostFailure.error : null }
  const reason = !usageWithinReservation ? 'output-budget-exceeded' : !reply ? 'provider-error' : !reply.isAnswered ? 'provider-unanswered' : null
  const callEvent = { schemaVersion: 1, kind: 'side-call', callId: `${callBinding.sessionId}/${callBinding.generationId}/${callBinding.turnId}/${++s.jobNumber}`, modelId: selection.modelId, binding: callBinding, usage: reply?.usage ?? null, elapsedMs, timeoutMs: modelTimeout ?? null, reason, ...hostDiagnostic, ...budgetDiagnostic, result: reply?.isAnswered && usageWithinReservation ? 'answered' : 'unknown' }
  await remember($, callEvent)
  say($, `SIDE_CALL ${JSON.stringify({ callId: callEvent.callId, modelId: callEvent.modelId, result: callEvent.result, reason, ...hostDiagnostic, ...budgetDiagnostic, elapsedMs, timeoutMs: callEvent.timeoutMs, input: reply?.usage.input_tokens ?? null, output: reply?.usage.output_tokens ?? null, cached: reply?.usage.cache_read_input_tokens ?? null, created: reply?.usage.cache_creation_input_tokens ?? null })}`)
  await selectionOf($)
  if (!s.coordinator.matches(callBinding)) return undefined
  if (!reply || !reply.isAnswered || !usageWithinReservation) { s.coordinator.recordFailure(); s.modelDisabled = true }
  return usageWithinReservation ? reply : undefined
}
const currentSignals = new WeakMap<Runtime, AbortSignal>()

type PreparedFacts = { id: string; packet: AssistPacket; view: FactView; note: string; signal: AbortSignal; deadlineMs: number }
const locationFacts = async ($: EngineInterface, list: Rows): Promise<PreparedFacts | null> => {
  const s = await runtimeOf($)
  if (s.factsAttempted || s.modelDisabled || !s.asked) return null
  const symptom = assistSignal(s.asked, list, await $.session.cwd())
  if (symptom === null) return null
  const id = `facts-${++s.jobNumber}`
  const binding = { ...s.coordinator.binding }
  const job = s.coordinator.start(id, await $.clock.now())
  if (!job) return null
  s.factsAttempted = true
  const input: AssistInput = { binding, asked: s.asked, recentFacts: [], symptom }
  const host = hostOf($, job.signal)
  const startedAt = await $.clock.now()
  const deadlineMs = startedAt + s.coordinator.remainingTime(startedAt)
  let reason: string | null = 'unknown'
  const current = async () => {
    await selectionOf($)
    if (job.signal.aborted) { reason = job.signal.reason === 'cancelled' || job.signal.reason === 'disabled' ? job.signal.reason : 'stale-binding'; return false }
    if (!await isOn($)) { reason = 'disabled'; return false }
    if (!sameBinding(binding, s.coordinator.binding)) { reason = 'stale-binding'; return false }
    if (await $.clock.now() >= deadlineMs) { reason = 'deadline'; return false }
    return true
  }
  let finished = false
  let stage: 'selection' | 'inspection' | 'packet' = 'selection'
  let outcome: 'unknown' | 'abstained' | 'invalid' | 'prepared' = 'unknown'
  let request = localFactRequest(input.asked, symptom)
  const selectionMethod = request ? 'local-scoped' : 'model'
  try {
    if (!await current()) return null
    let firstPrompt = ''
    if (!request) {
      firstPrompt = factRequestPrompt(input.asked, symptom)
      const first = await ask($, firstPrompt, deadlineMs - await $.clock.now(), job.signal)
      if (!await current()) return null
      if (!first?.isAnswered) { reason = 'side-unanswered'; return null }
      request = parseFactRequest(first.text)
      if (!request) { outcome = first.text.trim() === 'null' ? 'abstained' : 'invalid'; reason = outcome === 'abstained' ? 'no-request' : 'invalid-request'; return null }
    }
    stage = 'inspection'
    const view = await host.inspectFacts(request, deadlineMs, { filesOnly: selectionMethod === 'local-scoped' })
    if (!await current()) return null
    if (view.incomplete) { reason = view.failureReason ?? 'inspection-unknown'; return null }
    stage = 'packet'
    const secondPrompt = selectionMethod === 'local-scoped' ? localPacketPrompt(view) : assistPacketPrompt(input, view)
    if (bytesOf(firstPrompt) + bytesOf(secondPrompt) > 65536) { reason = 'input-limit'; return null }
    const second = await ask($, secondPrompt, deadlineMs - await $.clock.now(), job.signal)
    if (!await current()) return null
    if (!second?.isAnswered) { reason = 'side-unanswered'; return null }
    const packet = selectionMethod === 'local-scoped' ? buildLocalAssistPacket(input, view, second.text) : buildAssistPacket(input, view, second.text)
    if (!packet) { outcome = second.text.trim() === 'null' ? 'abstained' : 'invalid'; reason = outcome === 'abstained' ? 'no-packet' : 'invalid-packet'; return null }
    if (!await current()) return null
    const note = assistNote(packet, view)
    if (bytesOf(note) > 32768) { reason = 'output-limit'; return null }
    finished = s.coordinator.finish(id, binding, 'succeeded', await $.clock.now())
    if (!finished) { reason = 'stale-binding'; return null }
    outcome = 'prepared'
    reason = null
    return { id, packet, view, note, signal: job.signal, deadlineMs }
  } catch (error) {
    if (await current().catch(() => false)) reason = 'service-error'
    await remember($, { kind: 'assistance', binding, result: 'unknown', reason: redact(String(error)) })
    return null
  } finally {
    if (!finished) s.coordinator.finish(id, binding, 'failed', await $.clock.now())
    const elapsedMs = Math.max(0, await $.clock.now() - startedAt)
    const event = { kind: 'assistance-attempt', binding, jobId: id, selectionMethod, stage, result: outcome, reason, elapsedMs, remainingMs: Math.max(0, deadlineMs - await $.clock.now()) }
    void remember($, event)
    say($, `FACTS_JOB ${JSON.stringify({ jobId: id, selectionMethod, stage, result: outcome, reason, elapsedMs, remainingMs: event.remainingMs })}`)
  }
}


// What a demonstrated defect's recheck is: exit 0 exactly when the probe's output no
// longer holds the text that showed the defect.
// A change, told apart from another by its length and an FNV-1a hash: what is kept to
// know the verifier read it, without keeping the change.
const signatureOfChange = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `${s.length}:${(h >>> 0).toString(16)}`
}

const semanticCapacity = async ($: EngineInterface, s: Runtime) => {
  const selection = await selectionOf($)
  const version = await $.session.version().then(value => value.version).catch(() => '')
  const profile = selection.modelId ? reviewCompletionProfile(version, selection.modelId) : null
  // Unknown profiles still reach ask's explicit unverified-output-cap refusal;
  // never invent a transport cap or select another model here.
  return profile ? Math.min(s.coordinator.remainingModelCalls, Math.floor(s.coordinator.remainingOutputTokens / (profile.maxTokens + profile.outputAllowance))) : s.coordinator.remainingModelCalls
}

type PreparedReview = { id: string; binding: Binding; context: ReviewContext; decision: ReviewReply; outcome: ReviewOutcome; deadlineMs: number }
type ReviewCapture = { binding: Binding; asked: string; sequence: number; capturedAt: number; cwd: string; opportunity?: ReviewOpportunity<ReviewFrame>; material?: { changes: { text: string; omitted: string[] }; phase: ReviewContext['phase'] } }
type ReviewFrame = { capture: ReviewCapture; list: Rows; final: boolean; answer: string }
const reviewFrame = async ($: EngineInterface, list: Rows, final = false, answer = '', excludeToolId?: string): Promise<ReviewFrame> => {
  const s = await runtimeOf($)
  await refreshReviewProject($, s)
  const capture: ReviewCapture = { binding: { ...s.coordinator.binding }, asked: s.asked, sequence: s.reviewSequence, capturedAt: await $.clock.now(), cwd: s.reviewCwd }
  if (s.cfg.reviewSchedule === 'incremental') {
    const completedRows = list.map(row => ({ ...row, toolUses: row.toolUses?.filter(use => (excludeToolId === undefined || use.tool_use_id !== excludeToolId) && (use.result !== undefined || use.text !== undefined || use.isError === true)) }))
    const record = evidenceOf(completedRows), since = record.prompts.at(-1)?.at ?? 0
    const run = record.runs.filter(run => run.at >= since).at(-1)
    const edit = record.edits.filter(edit => edit.at >= since).at(-1)
    capture.material = { changes: reviewChangesOf(record), phase: final ? 'completion' : run && !run.ok ? 'failure' : edit && run && run.at >= edit.at ? 'implementation' : 'exploration' }
    // Capture bounded material now. Retaining whole transcripts in each pending
    // milestone would multiply memory and accidentally pair later code with it.
    return { capture, list: [], final, answer: '' }
  }
  return { capture, list: JSON.parse(JSON.stringify(list)), final, answer }
}
const engineeringReview = async ($: EngineInterface, list: Rows, final = false, answer = '', captured?: ReviewCapture): Promise<PreparedReview | null> => {
  const s = await runtimeOf($), mode = s.cfg.assistanceMode
  if (!['supervise', 'probe', 'recovery'].includes(mode) || !captured || !sameTask(captured.binding, s.coordinator.binding)) return null
  const record = evidenceOf(list), since = record.prompts.at(-1)?.at ?? 0
  const changes = changesOf(record, 24576), lastRun = record.runs.filter(r => r.at >= since).at(-1)
  const lastEdit = record.edits.filter(e => e.at >= since).at(-1)?.at ?? -1
  let phase: ReviewContext['phase'] = captured.material?.phase ?? (final ? 'completion' : lastRun && !lastRun.ok ? 'failure' : changes && lastRun && lastRun.at >= lastEdit ? 'implementation' : 'plan')
  const binding = { ...captured.binding }
  const skipped = async (reason: string) => {
    const key = `${phase}:${reason}`
    if (s.reviewSkipKeys.has(key) || s.reviewSkipKeys.size >= 32) return null
    s.reviewSkipKeys.add(key)
    const event = { kind: 'engineering-review', binding, mode, phase, reviewPhase: s.cfg.reviewPhase, result: 'skipped', reason, reviewed: [], unreviewed: REVIEW_DIMENSIONS }
    await remember($, event)
    say($, `REVIEW ${JSON.stringify(event)}`)
    return null
  }
  if (!s.stateUsable || !captured.asked) return skipped('context-unavailable')
  const incremental = s.cfg.reviewSchedule === 'incremental'
  if (s.cfg.reviewSchedule === null || incremental && !s.cfg.reviewPolicyValid) return skipped('invalid-review-policy')
  if (!incremental && s.cfg.reviewPhase === null) return skipped('invalid-review-phase')
  if (!incremental && s.reviewAttempts >= 2) return skipped('budget-exhausted')
  if (incremental && !final) {
    const firstWrite = captured.opportunity?.reasons.includes('first-write')
    const ordinary = captured.opportunity?.reasons.every(reason => reason === 'interval')
    const reserved = 1 + (ordinary && !s.firstWrite && !firstWrite ? 1 : 0)
    if (await semanticCapacity($, s) <= reserved) return skipped('milestone-budget-reserved')
  }
  if (s.modelDisabled) return skipped('side-model-unavailable')
  if (!s.coordinator.modelBudgetAvailable) return skipped('budget-exhausted')
  if (!incremental && final && s.reviewStopSent) return skipped('completion-feedback-already-offered')
  const latestPrompt = list.findLastIndex(r => r.role === 'user' && r.text.trim() && !r.text.includes('[deepseek-supervisor]') && !/^\s*<(?:system-reminder|command-|local-command|teammate-message)|^\s*Another Claude session/.test(r.text))
  const rows = latestPrompt < 0 ? list : list.slice(latestPrompt + 1)
  const changeMaterial = captured.material?.changes ?? reviewChangesOf(record)
  const context = incremental && captured.opportunity ? buildIncrementalContext(binding, captured.asked, captured.opportunity, changeMaterial.text, phase, changeMaterial.omitted) : buildReviewContext(binding, captured.asked, answer ? [...rows, { role: 'assistant', text: answer, toolUses: [] }] : rows, changeMaterial.text, phase, changeMaterial.omitted)
  if (!context) return skipped('context-rejected')
  if (!incremental && !final && phase === 'plan' && changes !== '') return skipped('awaiting-post-edit-check')
  if (!incremental && !final && phase === 'plan' && !context.sources.some(source => source.kind === 'plan')) {
    if (!hasExplorationEvidence(context)) return skipped('insufficient-exploration-evidence')
    phase = 'exploration'; context.phase = phase
  }
  if (!incremental && !reviewPhaseMatches(s.cfg.reviewPhase!, context)) return skipped('phase-deferred')
  if (mode === 'recovery' && (s.reviewRecoveryUsed || !recoveryObservations(context).length)) return skipped(s.reviewRecoveryUsed ? 'recovery-already-offered' : 'insufficient-recovery-evidence')
  const material = incremental ? context.sources : phase === 'exploration' ? context.sources.filter(source => source.kind === 'requirement') : phase === 'plan' ? context.sources.filter(source => source.kind === 'plan' || source.kind === 'requirement') : context.sources
  const key = `${phase}:${signatureOfChange(JSON.stringify(material))}`
  if (s.reviewSignatures.has(key)) return skipped('already-considered-context')
  const launchAt = await $.clock.now()
  if (!sameTask(binding, s.coordinator.binding)) return null
  const id = `review-${++s.jobNumber}`, job = s.coordinator.start(id, launchAt)
  if (!job) return skipped('review-in-flight-or-budget-unavailable')
  s.reviewSignatures.add(key); s.reviewAttempts++
  const lastTool = context.sources.filter(source => source.kind === 'tool' || source.kind === 'observation').at(-1)
  const uses = rows.filter(row => row.role === 'assistant').flatMap(row => row.toolUses ?? []).slice(-6)
  const use = lastTool ? uses[Number(lastTool.id.slice(5)) - 1] : undefined
  const input = use?.input as { file_path?: unknown; path?: unknown } | undefined
  const rawPath = input?.file_path ?? input?.path
  const path = typeof rawPath === 'string' ? rawPath.startsWith(captured.cwd + '/') ? rawPath.slice(captured.cwd.length + 1) : rawPath : ''
  const safePath = path && !path.startsWith('/') && !path.split('/').some(part => part === '..') && redact(path) === path ? path : undefined
  const checkpointTool = incremental ? incrementalLastTool(context, captured.cwd) : lastTool && use ? { tool: use.tool, ...(use.tool_use_id ? { toolUseId: use.tool_use_id } : {}), ...(safePath ? { path: safePath } : {}) } : undefined
  context.checkpoint = { reviewId: id, checkpointId: `checkpoint-${captured.sequence}-${id}`, observedAt: captured.capturedAt, sequence: captured.sequence, requirementSignature: signatureOfChange(captured.asked), materialSignature: signatureOfChange(JSON.stringify(context.sources)), sourceIds: context.sources.map(source => source.id), ...(checkpointTool ? { lastTool: checkpointTool } : {}) }
  let deadlineMs = Infinity
  const invalidReason = async () => {
    if (sessions.get(binding.sessionId) !== s) return 'cancelled'
    await refreshReviewProject($, s)
    const enabled = await isOn($)
    if (!enabled) return 'disabled'
    if (job.signal.aborted) return job.signal.reason === 'cancelled' || job.signal.reason === 'disabled' ? job.signal.reason : 'stale-binding'
    if (!sameTask(binding, s.coordinator.binding)) return 'stale-binding'
    return null
  }
  const current = async () => await invalidReason() === null
  let outcome: ReviewOutcome | undefined, retained = false
  try {
    const prompt = redact(reviewPrompt(context, mode as 'supervise' | 'probe' | 'recovery'))
    const inputEvent = { kind: 'engineering-review-input', id, status: 'prepared', modelId: (await selectionOf($)).modelId, promptSignature: signatureOfChange(prompt), context: JSON.parse(prompt.split('\n\n').at(-1)!) }
    await remember($, inputEvent)
    for (const line of reviewInputLogs(inputEvent)) say($, line)
    const reply = await ask($, prompt, deadlineMs - await $.clock.now(), job.signal)
    const invalid = await invalidReason()
    if (invalid) return skipped(invalid)
    if (!reply?.isAnswered) return skipped('review-unanswered')
    const decision = parseReview(context, reply.text, true)
    deadlineMs = await $.clock.now() + s.coordinator.remainingTime(await $.clock.now())
    if (!decision) return skipped('invalid-review-protocol')
    if (mode === 'probe' && !['none', 'probe'].includes(decision.action.kind) || mode === 'recovery' && !['none', 'recovery'].includes(decision.action.kind)) return skipped('invalid-action-for-mode')
    if (decision.action.kind === 'recovery') {
      if (s.reviewRecoveryUsed) return null
      s.reviewRecoveryUsed = true
    }
    outcome = await runHistoricalReviewFlow(context, decision, { host: hostOf($, job.signal), executionMode: s.cfg.executionMode, deadlineMs, excludeModelWait: true, current, taskCurrent: current, sourceCurrent: async () => s.coordinator.remainingTime(await $.clock.now()) > 0 && sameBinding(binding, s.coordinator.binding) && await $.session.cwd() === captured.cwd, ask: async prompt => {
      if (incremental && !final && await semanticCapacity($, s) <= 1) return null
      const second = await ask($, prompt, deadlineMs - await $.clock.now(), job.signal)
      return second?.isAnswered ? second.text : null
    } })
    const event = { kind: 'engineering-review', id, binding, mode, phase, reviewSchedule: s.cfg.reviewSchedule, opportunity: context.opportunity, reviewPhase: s.cfg.reviewPhase, contextScope: context.scope, reviewed: decision.reviewed, unreviewed: REVIEW_DIMENSIONS.filter(d => !decision.reviewed.includes(d)), judgment: decision.judgment, report: decision.report ?? null, responseFormat: decision.report ? 'advisory-report' : 'structured-judgment', action: decision.action.kind, actionProtocol: outcome.actionProtocol, reason: outcome.reason, independentExecution: outcome.evidence !== null, sourceIds: context.sources.map(source => source.id), supplementalFacts: outcome.view?.facts.filter(f => outcome!.sourceFactIds.includes(f.id)).map(f => ({ id: f.id, path: f.path, line: f.startLine, fileHash: f.fileHash })) ?? [], observation: outcome.evidence ? { id: outcome.evidence.id, outcome: outcome.evidence.outcome, binding: outcome.evidence.binding, truncated: outcome.evidence.truncated } : null }
    await remember($, event)
    const metadata = event
    say($, `REVIEW ${JSON.stringify({ ...metadata, dimension: decision.judgment?.dimension ?? null, recommendation: decision.judgment?.recommendation ?? null })}`)
    if (!await current() || !outcome.note || !decision.report && decision.judgment?.recommendation === 'continue' && decision.action.kind === 'none') return null
    retained = true
    return { id, binding, context, decision, outcome, deadlineMs }
  } catch {
    say($, `REVIEW ${JSON.stringify({ phase, mode, reason: 'review-unavailable' })}`)
    return null
  } finally {
    if (!retained) { try { await outcome?.cleanup() } finally { s.coordinator.finish(id, binding, 'failed', await $.clock.now()) } }
  }
}

const finishReview = async ($: EngineInterface, prepared: PreparedReview | null) => {
  if (!prepared) return
  const s = await runtimeOf($)
  try { await prepared.outcome.cleanup() }
  finally { s.coordinator.finish(prepared.id, prepared.binding, 'succeeded', await $.clock.now()) }
}

const semanticMode = (s: Runtime) => ['supervise', 'probe', 'recovery'].includes(s.cfg.assistanceMode)
const reviewLifecycle = ($: EngineInterface, s: Runtime) => say($, `REVIEW_LIFECYCLE ${JSON.stringify({ active: !!(s.reviewPending || s.reviewReady || s.reviewDraining || s.cfg.reviewSchedule === 'incremental' && s.incremental.pending && s.coordinator.modelBudgetAvailable), followUps: s.followUps, acceptedFollowUps: s.acceptedReviewFollowUps, taskRevision: s.coordinator.binding.taskRevision })}`)

// The optional headless adapter announces an input before native SDK admission.
// This channel may only revoke work: it cannot submit text, enable supervision,
// restore budget, or authorize an action. Real prompt admission still owns those.
const readReviewControl = async ($: EngineInterface, path: string) => {
  const text = await $.fs.read(path)
  if (text.length > 128) throw Error('invalid review control')
  const value = JSON.parse(text)
  if (value?.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('invalid review control')
  return value.revision as number
}
const pollReviewControl = async ($: EngineInterface, s: Runtime) => {
  const control = s.reviewControl
  if (!control || control.busy || sessions.get(s.coordinator.binding.sessionId) !== s) return
  control.busy = true
  try {
    let revision: number | null
    try { revision = await readReviewControl($, control.path) } catch { revision = null }
    if (s.reviewControl !== control || sessions.get(s.coordinator.binding.sessionId) !== s) return
    if (revision === control.revision) return
    // A missing/replaced/malformed channel fails closed; never release the gate
    // merely because an untrusted file supplied an older revision.
    const valid = revision !== null && revision > control.revision
    if (valid && revision !== null) control.revision = revision
    else { control.timer?.cancel(); s.reviewControl = undefined }
    const generationId = `adapter-input-${++s.jobNumber}`
    s.reviewInputPending = generationId
    s.coordinator.invalidate({ ...s.coordinator.binding, generationId }, { preserveBudget: true, now: await $.clock.now(), reason: 'cancelled' })
    s.reviewPending = undefined; s.reviewReady = undefined
    await say($, `REVIEW_CONTROL ${JSON.stringify({ revision, status: valid ? 'cancelled' : 'unavailable' })}`)
    await reviewLifecycle($, s)
  } finally { control.busy = false }
}

const refreshReviewProject = async ($: EngineInterface, s: Runtime) => {
  await selectionOf($)
  // Concurrent callbacks share the same lookup. If cwd changes while it is
  // pending, the post-lookup cwd check invalidates conservatively.
  if (s.reviewProjectPending) return s.reviewProjectPending
  const pending = (async () => {
    const cwd = await $.session.cwd(), binding = { ...s.coordinator.binding }
    let workspace = s.reviewWorkspace
    if (s.cfg.reviewSchedule === 'incremental' && (cwd !== s.reviewCwd || workspace === undefined)) {
      const deadlineMs = await $.clock.now() + 2500
      const value = await service($, { action: 'workspace-identity', root: cwd, deadlineMs }, deadlineMs).catch(() => null) as { root?: unknown; gitDirectory?: unknown } | null
      const path = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && v.length <= 4096 && !/[\0\r\n]/.test(v) && redact(v) === v
      workspace = value && path(value.root) && path(value.gitDirectory) ? { root: value.root, gitDirectory: value.gitDirectory } : null
    }
    if (!sameTask(binding, s.coordinator.binding)) return
    const latestCwd = await $.session.cwd()
    const sameWorkspace = s.cfg.reviewSchedule === 'incremental' && s.reviewWorkspace && workspace && s.reviewWorkspace.root === workspace.root && s.reviewWorkspace.gitDirectory === workspace.gitDirectory
    if (latestCwd !== cwd || cwd !== s.reviewCwd && !sameWorkspace) s.coordinator.invalidate({ ...s.coordinator.binding, generationId: `project-${++s.jobNumber}` }, { preserveBudget: true, now: await $.clock.now() })
    s.reviewCwd = latestCwd
    s.reviewWorkspace = latestCwd === cwd ? workspace : undefined
  })()
  s.reviewProjectPending = pending
  try { await pending } finally { if (s.reviewProjectPending === pending) s.reviewProjectPending = undefined }
  if (s.reviewDraining && !sameTask(s.reviewDraining.binding, s.coordinator.binding)) s.reviewDraining = undefined
  if (s.reviewPending && !sameTask(s.reviewPending.binding, s.coordinator.binding)) s.reviewPending = undefined
  if (s.reviewReady && !sameTask(s.reviewReady.binding, s.coordinator.binding)) s.reviewReady = undefined
}

const takeReviewNote = async ($: EngineInterface, prepared: PreparedReview): Promise<{ note: string; facts: string[] } | null> => {
  const s = await runtimeOf($)
  await refreshReviewProject($, s)
  if (!await isOn($) || !sameTask(prepared.binding, s.coordinator.binding)) return null
  let outcome = prepared.outcome
  const started = await $.clock.now(), left = s.coordinator.remainingTime(started)
  // Queued model advice does not expire with the tool budget. Evidence still
  // requires its original version, deadline and manifest; failure falls back to advice.
  if (!sameBinding(prepared.binding, s.coordinator.binding) || left <= 0 || !await outcome.validate().catch(() => false)) outcome = historicalReviewOutcome(prepared.context, prepared.decision, s.cfg.executionMode, async () => sameTask(prepared.binding, s.coordinator.binding))
  s.coordinator.chargeActivity(prepared.binding, Math.max(0, await $.clock.now() - started))
  await refreshReviewProject($, s)
  if (!await isOn($) || !sameTask(prepared.binding, s.coordinator.binding) || !outcome.note) return null
  if (!sameBinding(prepared.binding, s.coordinator.binding)) outcome = historicalReviewOutcome(prepared.context, prepared.decision, s.cfg.executionMode, async () => true)
  if (!outcome.note) return null
  return { note: `${outcome.note}\n\nDelivery at local observation sequence ${s.reviewSequence}. Execution after checkpoint ${prepared.context.checkpoint?.checkpointId ?? 'unknown'} was not reviewed; whether this concern was subsequently corrected is unknown.`, facts: outcome.sourceFactIds }
}

const drainReview = async ($: EngineInterface, followup = false): Promise<string | null> => {
  const s = await runtimeOf($), prepared = s.reviewReady
  if (!prepared || s.reviewDraining) return null
  const draining = { binding: prepared.binding }
  s.reviewDraining = draining
  try {
    // Claim the single slot before awaiting validation or submitting feedback.
    s.reviewReady = undefined
    const ready = await takeReviewNote($, prepared)
    if (!ready) return null
    if (followup && s.followUps >= FOLLOW_UPS_PER_PROMPT) return null
    if (followup) { s.followUps++; s.reviewStopSent = true }
    let note: string | null = null
    const status = await s.coordinator.deliver(prepared.id, prepared.binding, async () => {
      if (!await isOn($) || !sameTask(prepared.binding, s.coordinator.binding)) return 'dropped'
      if (followup) {
        const result = await $.prompt.submit({ text: ready.note })
        if (result.drop !== undefined) return 'dropped'
        s.acceptedReviewFollowUps++
        return 'delivered'
      }
      note = ready.note
      return 'unknown'
    })
    say($, `REVIEW_DELIVERY ${JSON.stringify({ id: prepared.id, checkpoint: prepared.context.checkpoint, binding: prepared.binding, delivery: status === 'dropped' ? 'dropped' : followup ? status === 'delivered' ? 'submitted' : 'unknown' : note ? 'context-returned' : 'unknown', consumption: 'unknown', sourceFactCount: ready.facts.length, sourceFactIds: ready.facts })}`)
    return status === 'dropped' || !sameTask(prepared.binding, s.coordinator.binding) ? null : note
  } finally { if (s.reviewDraining === draining) s.reviewDraining = undefined; await reviewLifecycle($, s); if (s.cfg.reviewSchedule === 'incremental' && s.incremental.pending) await scheduleReview($, []) }
}

const proposedWriteInput = (event: { tool: string }) => {
  const raw = event as unknown as Record<string, unknown>
  const fields = event.tool === 'Write' ? ['file_path', 'content'] : event.tool === 'Edit' ? ['file_path', 'old_string', 'new_string', 'replace_all'] : event.tool === 'NotebookEdit' ? ['notebook_path', 'cell_id', 'new_source', 'cell_type', 'edit_mode'] : ['file_path', 'edits']
  return Object.fromEntries(fields.filter(key => raw[key] !== undefined).map(key => [key, raw[key]]))
}

const incrementalBatch = async ($: EngineInterface, list: Rows) => {
  const s = await runtimeOf($)
  const record = evidenceOf(list), since = record.prompts.at(-1)?.at ?? 0
  const rows = list.slice(Math.max(0, list.findLastIndex(r => r.role === 'user' && r.text.trim() && !r.text.includes('[deepseek-supervisor]') && !/^\s*<(?:system-reminder|command-|local-command|teammate-message)|^\s*Another Claude session/.test(r.text)) + 1))
  // Reuse only record formatting/privacy checks, never legacy plan admission.
  const tools = buildReviewContext(s.coordinator.binding, s.asked, rows.map(row => ({ ...row, text: '' })), '', 'implementation')
  for (const omission of tools?.scope.omitted ?? []) s.incremental.omit(omission)
  const uses = rows.filter(row => row.role === 'assistant').flatMap(row => row.toolUses ?? []).slice(-6)
  for (const source of tools?.sources ?? []) if (source.kind === 'tool' || source.kind === 'observation') {
    const use = uses[Number(source.id.slice(5)) - 1]
    // Distinct actual tool IDs preserve repeated-check evidence; replaying one
    // snapshot cannot manufacture three observations from one invocation.
    const text = use?.tool_use_id ? JSON.stringify({ ...JSON.parse(source.text), toolUseId: use.tool_use_id }) : source.text
    s.incremental.add(`tool-${use?.tool_use_id ?? signatureOfChange(source.text)}`, source.kind, text)
  }
  const changes = reviewChangesOf(record)
  for (const omission of changes.omitted) s.incremental.omit(omission)
  if (changes.text) s.incremental.add(`change-${signatureOfChange(changes.text)}`, 'change', changes.text)
  const run = record.runs.filter(run => run.at >= since).at(-1)
  if (run) {
    const frame = await reviewFrame($, list)
    s.incremental.request(run.ok ? 'verification' : 'failure', String(run.at), frame)
  }
}

const scheduleReview = async ($: EngineInterface, list: Rows, final = false, answer = '') => {
  const s = await runtimeOf($)
  if (!semanticMode(s)) return
  await refreshReviewProject($, s)
  const incremental = s.cfg.reviewSchedule === 'incremental'
  if (incremental && final && s.followUps >= FOLLOW_UPS_PER_PROMPT) { s.incremental.clearPending(); return }
  if (incremental && final) {
    s.incremental.add(`answer-${signatureOfChange(answer)}`, 'answer', answer)
    s.incremental.request('completion', `answer-${signatureOfChange(answer)}`, await reviewFrame($, list, true, answer))
  }
  if (s.reviewInputPending || s.reviewPending || s.reviewReady || s.reviewDraining || !await isOn($)) return
  let frame: ReviewFrame
  let opportunity: ReviewOpportunity<ReviewFrame> | null = null
  if (incremental) {
    if (!s.coordinator.modelBudgetAvailable) { s.incremental.clearPending(); return }
    opportunity = s.incremental.take()
    if (!opportunity?.frame) return
    frame = opportunity.frame
  } else frame = await reviewFrame($, list, final, answer)
  const captured = { ...frame.capture, ...(opportunity ? { opportunity } : {}) }
  if (!sameTask(captured.binding, s.coordinator.binding)) { s.incremental.clearPending(); return }
  const pending = { binding: captured.binding, token: ++s.jobNumber }
  s.reviewPending = pending
  await reviewLifecycle($, s)
  $.clock.after(0, () => { void (async () => {
    let prepared: PreparedReview | null = null
    try {
      if (!sameTask(captured.binding, s.coordinator.binding) || !await isOn($)) return
      prepared = await engineeringReview($, frame.list, frame.final, frame.answer, captured)
      await finishReview($, prepared)
      if (s.reviewPending !== pending || !sameTask(captured.binding, s.coordinator.binding)) return
      if (prepared) {
        s.reviewReady = prepared
        say($, `REVIEW_QUEUED ${JSON.stringify({ id: prepared.id, checkpoint: prepared.context.checkpoint, consumption: 'unknown' })}`)
      }
      if (!s.mainActive) await drainReview($, true)
    } catch (error) { say($, `background review failed: ${redact(String(error))}`) }
    finally {
      if (s.reviewPending === pending) {
        s.reviewPending = undefined
        await reviewLifecycle($, s)
        if (incremental && !s.reviewReady && s.incremental.pending) await scheduleReview($, [])
      }
    }
  })() })
}

/**
 * Checks claims by running commands, and reads the turn's change for a defect a
 * command can show. Open items that carry a recheck are settled by code first:
 * matching observations are preserved; generated semantic oracles stay unknown.
 */
const verify = async ($: EngineInterface, input: VerifyInput): Promise<VerifyResult> => {
  const s = await runtimeOf($)
  const jobSignal = currentSignals.get(s)
  const host = hostOf($, jobSignal)
  const deadlineMs = await $.clock.now() + s.coordinator.remainingTime(await $.clock.now())
  const snapshot = s.cfg.executionMode === 'off' ? null : await captureSnapshot(host, { ...s.coordinator.binding }, deadlineMs)
  const mode: Mode = snapshot === null ? 'read-only' : 'copy'
  const result: VerifyResult = { mode, probes: [], defects: [], fixed: [], ran: [], cost: { cached: 0, input: 0, output: 0, calls: 0 } }
  const observed = new Map<string, ExecutionEvidence>()
  let evidenceBytes = 0
  const run = async (command: string) => {
    if (!snapshot || await $.clock.now() + 500 >= deadlineMs) return undefined
    const e = await host.execute(command, snapshot, deadlineMs, [])
    evidenceBytes += bytesOf(JSON.stringify(e))
    if (evidenceBytes > 20 * 1024 * 1024) throw Error('evidence journal limit')
    await $.store.set('latest-evidence', { schemaVersion: 2, binding: snapshot.binding, observations: [...observed.values(), e] })
    observed.set(command.trim(), e)
    return { exitCode: e.exitCode, out: `${e.stdout}${e.stderr ? `\n[stderr]\n${e.stderr}` : ''}`, ms: e.endedAt - e.startedAt, evidence: e }
  }
  try {
    // Rechecks run only in a copy: they are the project's own commands and may write.
    if (mode === 'copy') {
      for (const i of input.open.filter(i => (i.recheck ?? '') !== '')) {
        // A recheck is the verifier's command too: kept to the copy like the rest.
        const no = refusal(i.recheck ?? '', mode, input.cwd)
        if (no !== undefined) {
          result.ran.push({ command: i.recheck ?? '', exitCode: null, ms: 0, refused: no })
          continue
        }
        const r = await run(i.recheck ?? '')
        if (!r) continue
        result.ran.push({ command: i.recheck ?? '', exitCode: r.exitCode, ms: r.ms })
        if (i.resolution !== 'unknown' && r.evidence.outcome === 'passed' && i.defect === undefined && i.probe.trim() === (i.recheck ?? '').trim()) result.fixed.push({ id: i.id, saw: clip(squash(r.out), 300) || `\`${i.recheck}\` exited 0` })
      }
    }
    const toRecheck = input.open.filter(i => i.from === 'verify' && i.defect === undefined && (mode !== 'copy' || (i.recheck ?? '') === ''))
    // With no copy nothing runs the checks: whether they pass is the record's to say.
    if (mode === 'read-only') input = { ...input, claims: input.claims.filter(c => !isCheckClaim(c)) }
    if (input.claims.length === 0 && (input.changes ?? '') === '') return result

    let transcript = verifyPrompt(input, mode, toRecheck)
    const started = await $.clock.now()
    for (let round = 1; round <= ROUNDS; round++) {
      // Out of time: the next reply is the last, with no more commands.
      const final = round === ROUNDS || (await $.clock.now()) - started > (input.budgetMs ?? 30000) * 0.6
      const left = deadlineMs - await $.clock.now()
      if (left <= 500) return { ...result, reason: 'deadline exhausted' }
      const reply = await ask($, final ? `${transcript}\n\nNo more commands: answer with the "checked" object now.` : transcript, left, jobSignal)
      if (!reply) return { ...result, reason: 'rules-only: model identity, availability or budget' }
      addCost(result.cost, reply.usage)
      if (!reply.isAnswered) return { ...result, reason: reply.reason }
      let turn = parseTurn(reply.text, input.claims)
      // One second chance for a reply that is not one JSON object.
      if (turn === null) {
        const again = await ask($, `${transcript}\n\n[your reply]\n${clip(reply.text, 2000)}\n\nThat was not one JSON object. Answer again with exactly one JSON object and nothing else.`, left, jobSignal)
        if (!again) return { ...result, reason: 'protocol retry budget exhausted' }
        addCost(result.cost, again.usage)
        turn = again.isAnswered ? parseTurn(again.text, input.claims) : null
      }
      if (turn === null) return { ...result, reason: 'unreadable reply' }
      if ('checked' in turn) {
        result.probes = turn.checked.filter(p => {
          const e = observed.get(p.command.trim())
          return p.verdict !== 'false' || e !== undefined && validateObservation(p.command, p.saw, e, snapshot?.binding ?? e.binding)
        })

        const changed = squash(input.changes ?? '')
        for (const d of turn.defects) {
          // The line must be one the assistant changed: a defect elsewhere is not this turn's.
          if (!changed.includes(squash(d.line).replace(/^[+-]\s*/, ''))) continue
          // In a copy, shown or nothing: the command ran here and printed what shows it.
          const execution = observed.get(d.command.trim())
          const out = execution ? `${execution.stdout}\n${execution.stderr}` : undefined
          if (mode === 'copy') {
            if (execution && out !== undefined && validateObservation(d.command, d.expect, execution, snapshot?.binding ?? execution.binding)) result.defects.push({ ...d, saw: clip(squash(out), 300), demonstrated: false })
          } else {
            // Here the assistant runs the probe, under the person's own permissions: it must
            // run the project's code and do nothing else.
            const no = probeRefusal(d.command, isCheckCommand(d.command))
            if (no === undefined) result.defects.push({ ...d, saw: '', demonstrated: false })
            else result.ran.push({ command: d.command, exitCode: null, ms: 0, refused: `probe not passed on: ${no}` })
          }
        }
        return result
      }
      if (final || turn.run.length === 0) return { ...result, reason: 'no verdict' }
      const outputs: string[] = []
      for (const command of turn.run) {
        const no = refusal(command, mode, input.cwd)
        if (no !== undefined) {
          result.ran.push({ command, exitCode: null, ms: 0, refused: no })
          outputs.push(`$ ${command}\n[refused: ${no}]`)
          continue
        }
        if (!snapshot) {
          result.ran.push({ command, exitCode: null, ms: 0, refused: 'independent execution unavailable in read-only mode' })
          outputs.push(`$ ${command}\n[not executed: read-only mode]`)
          continue
        }
        const r = await run(command)
        if (!r) return { ...result, reason: 'deadline exhausted' }
        result.ran.push({ command, exitCode: r.exitCode, ms: r.ms })
        outputs.push(`$ ${command}\n[exit ${r.exitCode ?? 'none'}]\n${shown(r.out)}`)
      }
      transcript = `${transcript}\n\n[your turn ${round}]\n${reply.text.trim()}\n\n[output]\n${outputs.join('\n\n')}`
    }
    return { ...result, reason: 'no verdict' }
  } catch (err) {
    return { ...result, reason: `failed: ${String(err)}` }
  } finally {
    if (snapshot !== null) await host.cleanup(snapshot).catch(err => say($, `snapshot cleanup failed: ${String(err)}`))
  }
}

// A rule, not a model: an image made and never opened since, that the model has
// just named and said what it shows. Speaking of "the chart" without a name no longer
// counts: 图 alone tied a claim about an image it had read to every other one unopened;
// nor does saying where a file went ("cover3.png 已更新") (2026-10-09).
const SHOWS = /显示|看到|看着|看过|看起来|画面|图里|图中|图上|上面(?:是|有)|颜色|配色|位置|居中|对齐|清晰|正确|没问题|无误|\b(?:shows?|showing|looks?|visible|appears?|displays?|depicts?|correct(?:ly)?|renders? (?:fine|correctly|well))\b/i
const unopenedClaimed = (facts: Facts, claims: readonly string[]) =>
  facts.unopened
    .map(path => [path, claims.find(c => c.includes(base(path)) && SHOWS.test(c))] as const)
    .filter((x): x is readonly [string, string] => x[1] !== undefined)

// The model's own word that it told the person: `[ysk#3 told]`, `[ysk#3 refuted: …]`.
const TAG = /\[ysk#(\d+)\s+(told|refuted)\b[^\]]*\]/g

type Rows = { role: string; text: string; toolUses?: readonly { tool_use_id?: string; tool: string; input: unknown; text?: string; result?: unknown; isError?: true }[] }[]

// Whether an item already stands for what a finding says: one open item per
// question (whether the checks pass is one; a file, a command, a test edit, each
// another), and what was settled is not raised again for the same reason.
const isKnown = (f: Finding, items: readonly Issue[], saidAt: (quote: string) => number) =>
  items.some(i => {
    switch (f.kind) {
      case 'stuck':
        return i.rule === 'stuck' && i.quote === f.quote && (i.status === 'open' || i.saw === f.saw)
      case 'edit-miss':
        return i.rule === 'edit-miss' && i.quote === f.quote && i.status === 'open'
      case 'weakened-test':
      case 'ignored-constraint':
        return i.rule === f.kind && i.quote === f.quote
      case 'untouched':
        return i.probe === f.probe
      case 'unreported-failure':
      case 'skipped-check':
        // About this turn's answer: one open at a time, whatever was said of earlier turns.
        return i.rule === f.kind && i.status === 'open'
      default:
        return (
          (i.status === 'open' && isCheckKind(i.rule) && i.rule !== 'unreported-failure' && i.rule !== 'skipped-check') ||
          // The model said this rule misread these words: quoting them again in the
          // corrected answer is no new claim (2026-10-09). Another rule on them still is.
          (i.status === 'refuted' && i.rule === f.kind && isSameItem({ quote: f.quote }, i)) ||
          (isSameItem({ quote: f.quote }, i) && (i.status === 'open' || saidAt(f.quote) <= (i.said ?? (i.pos ?? Number.MAX_SAFE_INTEGER) - 1)))
        )
    }
  })

const COST: Record<Kind, string> = {
  'failed-check': 'the person will rely on work that was never shown to hold',
  'stale-check': 'the person will rely on work that was never shown to hold',
  'no-check': 'the person will rely on work that was never shown to hold',
  'unreported-failure': 'the person will take a failing build for a finished one',
  'skipped-check': 'the person will believe checks ran that never did',
  untouched: 'the person will think a file was changed that was not',
  stuck: 'more steps spent on changes that do not move the failure',
  'edit-miss': 'more steps spent on edits that cannot apply',
  'weakened-test': 'the tests stop checking what they checked, and the bug they found stays',
  'ignored-constraint': 'the person said not to; they will have to find and undo it',
}

// Items that keep a turn from ending: what the person would otherwise be handed as
// done. Circles and stale edits are the work's own business while it goes on.
// Nor a claim about the machine (what is installed): true or not, the work is the same.
const ABOUT_THE_MACHINE = /\b(?:installed|not installed|isn't installed|available on|on (?:the )?PATH|versions?)\b|已安装|未安装|没有安装|没装/i
const keepsTurnGoing = (i: Issue) => i.from !== 'verify' && i.rule !== 'stuck' && i.rule !== 'edit-miss'

type CheckOptions = {
  kind: 'during' | 'batch' | 'answer'
  /** The model's claims to hold to the record and, with `verifier`, hand to the verifier. */
  claims: readonly string[]
  /** The turn's final answer, at its end. */
  answer?: string
  /** Whether the verifier (a model, commands) may run in this check. */
  verifier: boolean
  /**
   * Whether this check raises what the rules find. The checks during the work leave
   * that to the batches and the turn's end, which deliver it where it is read.
   */
  rules?: boolean
}

// One check: the rules on the session's record and on images, the rechecks of open
// items, and the verifier on the claims and the turn's change. Settles what it can
// and returns the new items; the caller delivers them.
const check = async ($: EngineInterface, list: Rows, o: CheckOptions): Promise<Issue[]> => {
  const s = await runtimeOf($)
  const selection = await selectionOf($)
  const binding = { ...s.coordinator.binding }
  const at = await $.clock.now()
  if (!s.stateUsable) return []
  const before = await read($, track)
  const record = evidenceOf(list)
  const facts = { ...factsOf(list), runs: record.runs.slice(-6).map(r => `\`${clip(r.command, 100)}\`: ${r.ok ? 'passed' : `failed (${r.line || 'it reported a failure'})`}`) }
  const open = before.issues.filter(i => i.status === 'open')
  // The record first: no model, so no budget and no made-up evidence, and it works
  // where no command may run. Only what the record still contradicts now is raised:
  // a claim since made good is left alone.
  const ruled = [...contradictions(record, o.claims), ...(o.rules === false ? [] : recordFindings(record)), ...(o.answer === undefined ? [] : [...unreported(record, o.answer), ...skipped(record, o.answer)])].filter(
    f => settledBy(record, { rule: f.kind, quote: f.quote, probe: f.probe, saw: f.saw, recheck: f.recheck }) === undefined,
  )
  // The verifier runs whenever a check hands it a claim. A claim the record already contradicts, or
  // already bears out, is not handed to it: no model is needed for those.
  const canRun = s.cfg.assistanceMode === 'existing' && o.verifier && !s.modelDisabled && selection.modelId !== null
  // Nor a claim said before a later edit to code: it described files that have changed since.
  const lastCodeEdit = record.edits.filter(e => !/\.(?:md|markdown|txt|rst|adoc)$/i.test(e.path)).at(-1)?.at ?? -1
  const isCurrent = (c: string) => (record.saidAt.get(c) ?? Number.MAX_SAFE_INTEGER) > lastCodeEdit
  // Plans and honest failures are no claims to check.
  const handed = canRun ? o.claims.filter(c => isClaim(c) && !ruled.some(f => f.quote === c) && !supports(record, c) && isCurrent(c)) : []
  // A change the verifier already read to the end is not read again: a second review of
  // the same lines costs a call, and can only disagree with the first.
  const turnChanges = canRun && o.kind === 'answer' && s.cfg.reviewChanges ? changesOf(record) : ''
  const changes = turnChanges !== '' && signatureOfChange(turnChanges) === before.reviewed ? '' : turnChanges
  const rechecks = canRun && open.some(i => (i.recheck ?? '') !== '')
  const stillUnopened = new Set(facts.unopened)
  const images = unopenedClaimed(facts, o.claims)
  let v: VerifyResult | undefined
  if (handed.length > 0 || changes !== '' || rechecks) {
    $.ui.status('deepseek-supervisor checking what the model said…')
    const fallback = list.find(r => r.role === 'user' && r.text.trim() !== '' && !r.text.includes('[deepseek-supervisor]'))?.text ?? ''
    const jobId = `check-${++s.jobNumber}`
    const job = s.coordinator.start(jobId, await $.clock.now())
    if (job) {
      currentSignals.set(s, job.signal)
      v = await verify($, { claims: handed, asked: s.asked !== '' ? s.asked : fallback, facts, open, cwd: await $.session.cwd().catch(() => ''), changes, budgetMs: 30000 })
      await selectionOf($)
      if (currentSignals.get(s) === job.signal) currentSignals.delete(s)
      if (!s.coordinator.finish(jobId, binding, v.reason ? 'failed' : 'succeeded', await $.clock.now())) return []
    }
  }
  if (!sameBinding(binding, s.coordinator.binding) || !(await isOn($))) return []
  const done = await $.clock.now()
  let found: Issue[] = []
  await update($, track, t => {
    if (!sameBinding(binding, s.coordinator.binding)) return t
    let issues = t.issues.map((i): Issue => {
      const f = s.cfg.executionMode === 'shadow' ? undefined : v?.fixed.find(x => x.id === i.id)
      if (i.status !== 'open' && i.resolution !== 'open') return i
      if (f !== undefined) return { ...i, status: 'fixed', resolution: 'fixed', settledAt: done, why: f.saw }
      if (i.rule !== undefined) {
        const why = settledBy(record, i)
        return why === undefined ? i : { ...i, status: 'fixed', resolution: 'fixed', settledAt: done, why }
      }
      // A defect's probe, run by the model since: its output says whether it is there.
      if (i.defect !== undefined) return i
      if (i.from === 'rule' && i.probe.startsWith('Read ') && !stillUnopened.has(i.probe.slice(5))) return { ...i, status: 'fixed', resolution: 'fixed', settledAt: done, why: `${base(i.probe.slice(5))} was opened with Read` }
      return i
    })
    const fresh: Issue[] = []
    const next = () => t.nextId + fresh.length
    for (const f of o.rules === false ? [] : ruled) {
      // A claim not in the record yet is the answer being given now: said after everything,
      // and once it lands, at the end of the record as it is now.
      if (isKnown(f, [...issues, ...fresh], q => record.saidAt.get(q) ?? Number.MAX_SAFE_INTEGER)) continue
      const said = record.saidAt.get(f.quote) ?? record.end
      fresh.push({ id: next(), at: done, from: 'rule', resolution: 'open', disclosed: false, contested: false, rule: f.kind, what: f.what, quote: f.quote, probe: f.probe, ...(f.saw === undefined ? {} : { saw: f.saw }), ...(f.recheck === '' ? {} : { recheck: f.recheck }), cost: COST[f.kind], status: 'open', pos: record.end, said })
    }
    for (const p of (s.cfg.executionMode === 'shadow' ? [] : v?.probes ?? []).filter(p => p.verdict === 'false')) {
      if ([...issues, ...fresh].some(i => isSameItem({ quote: p.claim }, i))) continue
      fresh.push({ id: next(), at: done, from: 'verify', resolution: 'unknown', disclosed: false, contested: false, what: p.what, quote: p.claim, probe: p.command, saw: p.saw, recheck: p.recheck, cost: 'the person will act on a claim the output contradicts', status: 'open', pos: record.end })
    }
    for (const d of s.cfg.executionMode === 'shadow' ? [] : v?.defects ?? []) {
      if ([...issues, ...fresh].some(i => i.defect !== undefined && (squash(i.quote) === squash(d.line) || keyOf(i.probe) === keyOf(d.command)))) continue
      fresh.push({
        id: next(),
        at: done,
        from: 'verify',
        resolution: 'unknown', disclosed: false, contested: false,
        what: d.what,
        quote: d.line,
        probe: d.command,
        saw: d.saw,

        defect: { expect: d.expect, demonstrated: d.demonstrated },
        cost: 'the person gets code that does the wrong thing for an input they will meet',
        status: 'open',
        pos: record.end,
      })
    }
    for (const [path, claim] of images) {
      if ([...issues, ...fresh].some(i => i.probe.startsWith('Read ') && base(i.probe) === base(path))) continue
      fresh.push({ id: next(), at: done, from: 'rule', what: `${base(path)} was made and never opened since, yet the model has stated something about it`, quote: claim, probe: `Read ${path}`, cost: 'what the picture shows is asserted, not seen', status: 'open' })
    }
    found = fresh
    issues = [...issues, ...fresh].slice(-ISSUES_KEPT)
    const ran = v !== undefined && v.cost.calls > 0 && o.kind === 'during'
    const readToEnd = v !== undefined && v.reason === undefined && changes !== ''
    return { ...t, nextId: t.nextId + fresh.length, issues, seen: [...(t.seen ?? []), ...(v === undefined ? [] : handed)].slice(-SEEN_KEPT), runs: (t.runs ?? 0) + (ran ? 1 : 0), ...(readToEnd ? { reviewed: signatureOfChange(changes) } : {}) }
  })
  if (v !== undefined || found.length > 0)
    await remember($, {
      at: done,
      kind: o.kind,
      mode: v?.mode ?? null,
      claims: handed.length,
      changes: changes.length,
      probes: (v?.probes ?? []).map(p => ({ claim: p.claim, command: p.command, verdict: p.verdict, saw: p.saw })),
      defects: (v?.defects ?? []).map(d => ({ line: d.line, command: d.command, expect: d.expect, demonstrated: d.demonstrated })),
      fixed: (v?.fixed ?? []).map(f => f.id),
      found: found.map(i => i.id),
      rules: found.filter(i => i.rule !== undefined).map(i => ({ id: i.id, rule: i.rule, quote: i.quote })),
      ran: v?.ran ?? [],
      reason: v?.reason ?? null,
      cost: v?.cost ?? { cached: 0, input: 0, output: 0, calls: 0 },
      ms: done - at,
    })
  if (v !== undefined || found.length > 0 || o.kind !== 'batch')
    say(
      $,
      `CHECK ${JSON.stringify({ kind: o.kind, claims: handed.length, changes: changes.length, found: found.map(i => i.id), rules: found.filter(i => i.rule !== undefined).map(i => `${i.id}:${i.rule}`), defects: found.filter(i => i.defect !== undefined).map(i => i.id), fixed: v?.fixed.map(f => f.id) ?? [], reason: v?.reason })}`,
    )
  return found
}

const newClaims = (texts: readonly string[], seen: readonly string[]) => {
  const known = new Set(seen)
  return [...new Set(texts.flatMap(claimsOf))].filter(c => !known.has(c)).slice(-CLAIMS_PER_RUN)
}

// The claims said since the last check read the session, in messages no check has
// read yet. A list shorter than before was compacted: read it all, and let `seen`
// hold back what was already checked.
const claimsSince = (list: Rows, t: Track, extra: readonly string[] = []) => {
  const from = (t.scanned ?? 0) <= list.length ? (t.scanned ?? 0) : 0
  return newClaims([...list.slice(from).filter(r => r.role === 'assistant').map(r => r.text), ...extra], t.seen ?? [])
}

const messages = async ($: EngineInterface) => {
  const rows = await $.session.messages().catch(() => undefined)
  return (Array.isArray(rows) ? rows : []) as Rows
}

const showCards = async ($: EngineInterface, items: readonly Issue[]) => {
  const s = await runtimeOf($)
  const at = await $.clock.now()
  s.told += items.length
  s.last = `${items.length} at ${hhmm(at)}`
  s.promptsSinceCards = 0
  await update($, cards, () => ({ at, items: items.map(i => ({ what: `#${i.id} ${i.what}`, evidence: i.from === 'verify' ? `${i.probe} → ${i.saw ?? ''}` : i.quote, cost: i.cost })) }))
  await update($, isHidden, () => false)
}

// The model telling the person settles an item: it is then theirs to weigh.
const settleTags = async ($: EngineInterface, answer: string) => {
  const tags = [...answer.matchAll(TAG)]
  if (tags.length === 0) return
  const at = await $.clock.now()
  await update($, track, t => ({
    ...t,
    issues: t.issues.map(i => {
      const m = tags.find(x => Number(x[1]) === i.id)
      return m === undefined || i.resolution === 'fixed' || i.status === 'fixed' ? i : { ...i, disclosed: i.disclosed === true || m[2] === 'told', contested: i.contested === true || m[2] === 'refuted', resolution: i.resolution ?? (i.from === 'verify' ? 'unknown' : 'open'), status: m[2] === 'refuted' ? ('refuted' as const) : ('told' as const), settledAt: at, why: m[0] }
    }),
  }))
}

// During the work: every MIN_GAP finished steps, the model's new claims, for the verifier.
const tick = async ($: EngineInterface) => {
  const s = await runtimeOf($)
  const requested = { ...s.coordinator.binding }
  try {
    if (s.steps < MIN_GAP) return
    s.steps = 0
    const list = await messages($)
    // Only messages no earlier check read: an old claim pushed out of `seen` is not
    // handed over again.
    const claims = claimsSince(list, await read($, track))
    const found = await check($, list, { kind: 'during', claims, verifier: true, rules: false })
    await update($, track, t => ({ ...t, scanned: list.length }))
    if (found.length === 0 || !sameBinding(requested, s.coordinator.binding)) return
    await showCards($, found)
    // Refused or failed, the items are still in the band: say so, so the person can pass them on.
    const deliveryBinding = requested
    const delivery = await s.coordinator.deliver(found.map(i => i.id).join(','), deliveryBinding, async () => {
      const note = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: noteText(found) }] } })
      return note.deny !== undefined ? 'dropped' : 'delivered'
    })
    if (delivery !== 'delivered') {
      say($, `note not delivered (${delivery})`)
      $.ui.toast('deepseek-supervisor: a note did not reach the model; see the band above the prompt')
    }
  } catch (err) {
    say($, `check failed: ${err}`)
  } finally {
    s.isBusy = false
    await show($)
  }
}

// After a turn the person watches: the verifier on the answer's claims and the
// turn's change, off the turn so nobody waits on it. What does not hold goes back
// to the model as one follow-up prompt, at most one per prompt of the person's.
const atAnswer = async ($: EngineInterface, answer: string) => {
  const s = await runtimeOf($)
  const requested = { ...s.coordinator.binding }
  try {
    await settleTags($, answer)
    const list = await messages($)
    const claims = claimsSince(list, await read($, track), [answer])
    const found = await check($, list, { kind: 'answer', claims, answer, verifier: true })
    await update($, track, t => ({ ...t, scanned: list.length }))
    if (found.length === 0 || !sameBinding(requested, s.coordinator.binding)) return
    await showCards($, found)
    if (s.followUps >= FOLLOW_UPS_PER_PROMPT) return
    s.followUps += 1
    // The submit waits for the session to go idle; never await it inside the turn's end.
    await s.coordinator.deliver(found.map(i => i.id).join(','), requested, async () => {
      const result = await $.prompt.submit({ text: noteText(found) })
      return result.drop === undefined ? 'delivered' : 'dropped'
    })
  } catch (err) {
    say($, `answer check failed: ${err}`)
  } finally {
    await show($)
  }
}

export const register: Register = (on, options) => {
  registerBand(on)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const s = await runtimeOf($)
    await takeReading($)
    s.coordinator.invalidate({ ...s.coordinator.binding, generationId: `reload-${await $.clock.now()}-${++s.jobNumber}` })
    const restored = normalizeTrack(await read($, track))
    s.stateUsable = restored !== null
    if (restored) await update($, track, () => restored)
    else await $.store.set('unknown-state-original', await read($, track)).catch(() => undefined)
    s.modelDisabled = false
    s.cfg = configOf(options)
    s.coordinator = new Coordinator({ ...s.coordinator.binding }, { historical: semanticMode(s), ...(s.cfg.reviewSchedule === 'incremental' && semanticMode(s) ? { maxCalls: s.cfg.reviewMaxCalls, outputTokens: s.cfg.reviewOutputBudget } : {}) })
    s.incremental = new IncrementalReview(s.cfg.reviewInterval); s.firstWrite = false; s.publicStep = undefined
    s.reviewControl?.timer?.cancel(); s.reviewControl = undefined
    const controlPath = semanticMode(s) ? await $.env.get('DEEPSEEK_SUPERVISOR_CONTROL_FILE') : undefined
    if (controlPath?.startsWith('/') && !controlPath.includes('\0')) {
      try {
        const revision = await readReviewControl($, controlPath)
        s.reviewControl = { path: controlPath, revision, busy: false }
        s.reviewControl.timer = $.clock.every(100, () => { void pollReviewControl($, s).catch(() => undefined) })
        await say($, `REVIEW_CONTROL ${JSON.stringify({ revision, status: 'ready' })}`)
      } catch {
        s.reviewInputPending = 'adapter-unavailable'
        await say($, 'REVIEW_CONTROL {"revision":null,"status":"unavailable"}')
      }
    }
    s.reviewPending = undefined; s.reviewReady = undefined; s.mainActive = true; s.reviewCwd = await $.session.cwd(); s.reviewWorkspace = undefined; s.reviewProjectPending = undefined
    s.factsAttempted = false
    s.reviewSignatures.clear(); s.reviewAttempts = 0; s.reviewStopSent = false; s.reviewRecoveryUsed = false; s.reviewSkipKeys.clear()
    s.isInteractive = e.isInteractive !== false
    if (semanticMode(s)) await reviewLifecycle($, s)
    // A reload starts here too: what was raised before it does not hold a turn after it.
    s.turnFrom = await $.clock.now()
    await $.command
      .register({ name: 'deepseek-supervisor', immediate: true, description: 'Checks the model at work: rules on what it ran, and a second model running its claims. on, off, auto, log, or issues', argumentHint: '[on|off|auto|log|issues]' })
      .catch(err => say($, `command not registered: ${err}`))
    await show($)
    return result
  })

  // The person's prompts: what claims are checked against, a fresh budget, and the
  // band aging as "You should know" cards do.
  on('prompt.submit', async ($, e, next) => {
    const s = await runtimeOf($)
    const human = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk' || e.origin.kind === 'peer'
    const inputGeneration = human && semanticMode(s) ? `input-${++s.jobNumber}` : null
    if (inputGeneration) {
      // Admission can await a native safe boundary. Cancel before next(), not
      // after accepting: a new task must not wait for an unlimited old review.
      s.reviewInputPending = inputGeneration
      s.coordinator.invalidate({ ...s.coordinator.binding, generationId: inputGeneration }, { preserveBudget: true, now: await $.clock.now(), reason: 'cancelled' })
      s.reviewPending = undefined; s.reviewReady = undefined
    }
    const result = await next(e)
    if (inputGeneration && s.reviewInputPending === inputGeneration) s.reviewInputPending = undefined
    // A plugin followup is not a new user requirement and never restores budget.
    if (result.drop === undefined && human && (!inputGeneration || s.coordinator.binding.generationId === inputGeneration)) {
      s.coordinator.invalidate({ ...s.coordinator.binding, taskRevision: s.coordinator.binding.taskRevision + 1, turnId: `prompt-${s.coordinator.binding.taskRevision + 1}` })
      s.modelDisabled = false
      s.incremental.reset(); s.firstWrite = false; s.publicStep = undefined
      s.asked = e.text
      s.reviewPending = undefined; s.reviewReady = undefined; s.mainActive = true
      s.factsAttempted = false
      s.reviewSignatures.clear(); s.reviewAttempts = 0; s.reviewStopSent = false; s.reviewRecoveryUsed = false; s.reviewSkipKeys.clear()
      s.turnFrom = await $.clock.now()
      s.blocks = 0
      s.held = new Set()
      s.followUps = 0
      await update($, track, t => ({ ...t, runs: 0 })).catch(() => undefined)
      s.promptsSinceCards += 1
      if (s.promptsSinceCards >= CLEAR_AFTER_PROMPTS) await update($, cards, () => null).catch(() => undefined)
    }
    return result
  }).catch(($, e, next) => next(e))

  // Invalidate action freshness BEFORE a main tool can change files. Waiting
  // until PostToolBatch misses a side reply arriving while Edit is in progress.
  // Keep task identity/model waiting and their budget: historical advice survives.
  on('tool.call', async ($, e, next) => {
    const s = await runtimeOf($)
    if (e.agentId === undefined && semanticMode(s)) {
      if (s.cfg.reviewSchedule === 'incremental' && !s.firstWrite && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.tool) && await isOn($)) {
        s.firstWrite = true
        if (s.publicStep && sameTask(s.publicStep.binding, s.coordinator.binding)) { s.incremental.add(`stream-${s.publicStep.key}`, 'narrative', s.publicStep.text); s.publicStep.capturedText = s.publicStep.text }
        s.incremental.add(`proposal-${e.tool_use_id}`, 'proposed-change', JSON.stringify({ tool: e.tool, input: proposedWriteInput(e), status: 'proposed-before-execution' }))
        const frame = await reviewFrame($, await messages($), false, '', e.tool_use_id)
        s.incremental.request('first-write', 'first-write', frame)
        await scheduleReview($, [])
      }
      s.coordinator.changedWorkspace(`tool-start-${++s.jobNumber}`, await $.clock.now())
    }
    return next(e)
  })

  // After every batch of the main loop's tool calls, before the next request: the
  // rules on the record. What they find goes to the model with the tool results,
  // where it is read before the next step is chosen.
  on('classic.PostToolBatch', async ($, e, next) => {
    const s = await runtimeOf($)
    const result = await next(e)
    if (e.agent_id !== undefined || !(await isOn($))) return result
    if (!s.stateUsable) return result
    const list = await messages($)
    const end = evidenceOf(list).end
    if (end !== s.recordEnd) { s.coordinator.changedWorkspace(`tool-record-${end}`, await $.clock.now()); s.recordEnd = end; s.reviewSequence++ }
    const batchBinding = { ...s.coordinator.binding }
    const said = list.filter(r => r.role === 'assistant').map(r => r.text)
    // A `[ysk#3 told]` written in passing settles #3 as one in the final answer does.
    await settleTags($, said.join('\n'))
    const claims = [...new Set(said.flatMap(claimsOf))]
    const found = await check($, list, { kind: 'batch', claims, verifier: false })
    const assistance = s.cfg.assistanceMode === 'facts' ? await locationFacts($, list) : null
    if (semanticMode(s)) s.mainActive = true
    const engineeringNote = semanticMode(s) ? await drainReview($) : null
    if (s.cfg.reviewSchedule === 'incremental' && semanticMode(s)) await incrementalBatch($, list)
    await scheduleReview($, list)
    if (found.length === 0 && assistance === null && engineeringNote === null) return result
    if (found.length > 0) await showCards($, found)
    await show($)
    await selectionOf($)
    if (!(await isOn($)) || !sameBinding(batchBinding, s.coordinator.binding)) return result
    let note: string | null = null
    if (assistance) {
      // Reserve once, but the hook has no engine acknowledgement of consumption.
      const status = await s.coordinator.deliver(assistance.id, assistance.packet.binding, async () => 'unknown')
      if (status !== 'dropped' && await $.clock.now() < assistance.deadlineMs) {
        const current = await hostOf($, assistance.signal).validateFacts(assistance.view, assistance.deadlineMs).catch(() => false)
        if (current && !assistance.signal.aborted && sameBinding(batchBinding, s.coordinator.binding)) note = assistance.note
      }
    }
    // No awaited UI or storage operations after this final binding/source gate.
    if (!sameBinding(batchBinding, s.coordinator.binding)) return result
    if (note && assistance) {
      const event = { kind: 'assistance', binding: assistance.packet.binding, packet: assistance.packet, sources: assistance.view.facts.filter(f => assistance.packet.factIds.includes(f.id)), sourceManifestHash: assistance.view.manifestHash, delivery: 'context-returned' }
      void remember($, event)
      say($, `ASSIST ${JSON.stringify(event)}`)
    }
    return { ...result, additionalContext: [...(result.additionalContext ?? []), ...(found.length ? [noteText(found)] : []), ...(note ? [note] : []), ...(engineeringNote ? [engineeringNote] : [])] }

  }).catch(($, e, next) => next(e))

  // Before the turn ends: the answer held to the record (and, where nobody watches,
  // to the verifier). What does not hold keeps the turn going, at most twice a prompt.
  on('classic.Stop', async ($, e, next) => {
    const s = await runtimeOf($)
    const result = await next(e)
    if (!s.stateUsable || e.agent_id !== undefined || result.block !== undefined || !(await isOn($))) return result
    const answer = e.last_assistant_message ?? ''
    await settleTags($, answer)
    const list = await messages($)
    const engineeringNote = semanticMode(s) && !s.reviewStopSent ? await drainReview($) : null
    if (engineeringNote) s.reviewStopSent = true
    await scheduleReview($, list, true, answer)
    const found = await check($, list, { kind: 'answer', claims: claimsSince(list, await read($, track), [answer]), answer, verifier: !s.isInteractive })
    // Where the verifier ran here, what it read is read; where it runs after the turn, not yet.
    if (!s.isInteractive) await update($, track, t => ({ ...t, scanned: list.length }))
    await show($)
    if (found.length > 0) await showCards($, found)
    // What this turn raised and the record has not settled holds the turn too, whichever
    // check raised it first: an item the model never got to act on is not done with.
    const pending = (await read($, track)).issues.filter(i => i.status === 'open' && i.at >= s.turnFrom && !found.some(f => f.id === i.id))
    const blocking = [...found, ...pending].filter(i => keepsTurnGoing(i) && !s.held.has(i.id))
    if (blocking.length === 0 || s.blocks >= BLOCKS_PER_PROMPT) return engineeringNote ? { ...result, block: engineeringNote } : result
    s.blocks += 1
    for (const i of blocking) s.held.add(i.id)
    return { ...result, block: [noteText(blocking, { final: true }), ...(engineeringNote ? [engineeringNote] : [])].join('\n\n') }

  }).catch(($, e, next) => next(e))

  // The main loop's finished steps; a subagent's are its own.
  on('turn.step', async function* ($, e, next) {
    const s = await runtimeOf($)
    const binding = { ...s.coordinator.binding }
    const captureText = e.agentId === undefined && semanticMode(s) && s.cfg.reviewSchedule === 'incremental'
    const publicStep: Runtime['publicStep'] = captureText ? { key: `${e.turnId}:${e.index}`, text: '', binding } : undefined
    if (publicStep) s.publicStep = publicStep
    const result = captureText ? yield* observeStream(next(e), chunk => {
      if (publicStep && chunk.kind === 'text' && sameTask(binding, s.coordinator.binding)) {
        if (!publicStep.truncated && bytesOf(publicStep.text) + bytesOf(chunk.text) <= 16384) publicStep.text += chunk.text
        else { publicStep.truncated = true; publicStep.text = ''; s.incremental.omit('public-stream-budget') }
      }
    }) : yield* next(e)
    if (e.agentId !== undefined || result.stopReason === null) return result
    if (captureText && sameTask(binding, s.coordinator.binding) && await isOn($)) {
      const list = await messages($)
      const frame = await reviewFrame($, list)
      s.incremental.step(`${e.turnId}:${e.index}`, result.answer === publicStep?.capturedText ? '' : result.answer, frame, result.stopReason !== 'end_turn')
      await scheduleReview($, list)
    }
    s.reviewSequence++
    await selectionOf($)
    s.steps += 1
    // The step that ends the turn is the turn's end's to check: two checks of one answer
    // would ask the verifier twice.
    if (result.stopReason === 'end_turn') return result
    if (s.cfg.assistanceMode === 'existing' && !s.isBusy && s.steps >= MIN_GAP && (await isOn($))) {
      s.isBusy = true
      // Off the step's own dispatch, which closes when the step ends: work that
      // must outlive it runs from a timer.
      const scheduled = { ...s.coordinator.binding }
      $.clock.after(0, () => {
        if (sameBinding(scheduled, s.coordinator.binding)) void tick($)
        else s.isBusy = false
      })
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const s = await runtimeOf($)
    const result = await next(e)
    if (e.agentId === undefined && e.reason !== 'answer') s.coordinator.invalidate({ ...s.coordinator.binding, generationId: `cancel-${await $.clock.now()}-${++s.jobNumber}` }, { reason: 'cancelled', preserveBudget: true, now: await $.clock.now() })
    if (e.agentId === undefined && semanticMode(s)) {
      s.mainActive = false
      if (e.reason === 'answer') $.clock.after(0, () => { void drainReview($, true).catch(error => say($, `review followup unavailable: ${redact(String(error))}`)) })
      else { s.reviewReady = undefined; s.reviewPending = undefined; s.incremental.reset(); s.publicStep = undefined }
    }
    if (e.agentId === undefined) await takeReading($) // main-loop turns only
    // Only a turn the model finished on its own: one the person interrupted says nothing.
    // Where nobody watches, the verifier already ran before the turn could end.
    if (e.agentId !== undefined || e.reason !== 'answer' || s.cfg.assistanceMode !== 'existing' || !s.isInteractive || !(await isOn($))) return result
    const answer = e.answer
    const scheduled = { ...s.coordinator.binding }
    $.clock.after(0, () => {
      if (sameBinding(scheduled, s.coordinator.binding)) void atAnswer($, answer)
    })
    return result
  })

  on('session.end', async ($, e, next) => {
    const s = sessions.get(e.sessionId)
    s?.reviewControl?.timer?.cancel()
    if (s) s.coordinator.invalidate({ ...s.coordinator.binding, generationId: 'ended' })
    sessions.delete(e.sessionId)
    return next(e)
  })

  on('command.run', { command: 'deepseek-supervisor' }, async ($, e) => {
    const s = await runtimeOf($)
    const arg = e.args.trim().toLowerCase()
    if (arg === 'log') {
      const list = await $.store.get('history').catch(() => [])
      return { text: Array.isArray(list) && list.length > 0 ? JSON.stringify(list.slice(-10), null, 1) : 'No checks yet.' }
    }
    if (arg === 'issues') {
      if (!s.stateUsable) return { text: 'Unknown state schema; original state preserved. No correctness judgment available.' }
      const t = await read($, track)
      return {
        text:
          t.issues.length === 0
            ? 'No items this session.'
            : t.issues
                .map(i => {
                  const truth = ` resolution=${i.resolution ?? (i.status === 'fixed' ? 'fixed' : 'open')} disclosed=${i.disclosed === true} contested=${i.contested === true}`
                  const kind = i.defect !== undefined ? ` (defect, ${i.defect.demonstrated ? 'shown' : 'suspected'}: \`${i.defect.expect}\`)` : i.rule !== undefined ? ` (${i.rule})` : ''
                  return `#${i.id} [${i.status}]${kind} ${i.what}${i.from === 'verify' ? `\n   ran: ${i.probe}\n   saw: ${i.saw ?? ''}` : ''}${i.why === undefined ? '' : `\n   why: ${i.why}`}\n   ${truth}`
                })
                .join('\n'),
      }
    }
    if (arg === 'on' || arg === 'off' || arg === 'auto') {
      if (arg === 'auto') await $.store.delete('mode')
      else await $.store.set('mode', arg)
      if (!(await isOn($))) {
        s.coordinator.invalidate({ ...s.coordinator.binding, generationId: `off-${await $.clock.now()}-${++s.jobNumber}` }, { reason: 'disabled', preserveBudget: true, now: await $.clock.now() })
        s.incremental.reset(); s.publicStep = undefined
        await update($, cards, () => null)
      }
      await show($)
      return { text: `deepseek-supervisor is ${arg}${arg === 'auto' ? ` (${(await isOn($)) ? 'checking' : "idle on Anthropic's endpoint"})` : ''}.` }
    }
    const setting = await settingOf($)
    return { text: `deepseek-supervisor is ${setting}${setting === 'auto' ? ` (${(await isOn($)) ? 'checking' : "idle on Anthropic's endpoint"})` : ''}. Usage: /deepseek-supervisor [on|off|auto|log|issues]` }
  })
}
