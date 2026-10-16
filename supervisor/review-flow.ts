import type { ReviewContext, ReviewReply, FactView, Snapshot, ExecutionEvidence } from './contracts'
import type { Host } from './ports'
import { bytesOf } from '../hooks/prompt'
import { localPacketPrompt } from '../hooks/prompt'
import { reviewNote } from './review'
import { parseProbeCandidate, probeNote } from './probes'
import { buildRecoveryPacket } from './recovery'
import { captureSnapshot } from './workspace'
import { executeProbe } from './runner'

export type ReviewFlowPorts = { host: Host; executionMode: 'off' | 'shadow' | 'enabled'; deadlineMs: number; excludeModelWait?: boolean; current(): Promise<boolean>; ask(prompt: string): Promise<string | null> }
export type ReviewOutcome = { note: string | null; reason: string; view: FactView | null; sourceFactIds: string[]; evidence: ExecutionEvidence | null; validate(): Promise<boolean>; cleanup(): Promise<void> }

export const runReviewFlow = async (context: ReviewContext, reply: ReviewReply, ports: ReviewFlowPorts): Promise<ReviewOutcome> => {
  const { host } = ports
  let deadlineMs = ports.deadlineMs
  let snapshot: Snapshot | null = null, view: FactView | null = null, evidence: ExecutionEvidence | null = null, closed = false
  let sourceFactIds: string[] = []
  let reason = 'prepared', note = reply.judgment ? reviewNote(context, reply) : ''
  const current = async () => await host.now() < deadlineMs && await ports.current()
  const outcome = (): ReviewOutcome => ({
    note: ports.executionMode === 'shadow' || !note ? null : note, reason, view, sourceFactIds, evidence,
    validate: async () => await current() && (!view || await host.validateFacts(view, deadlineMs)) && (!snapshot || !!host.validateSnapshot && await host.validateSnapshot(snapshot, deadlineMs)) && await current(),
    cleanup: async () => { if (!closed) { closed = true; if (snapshot) await host.cleanup(snapshot) } },
  })
  if (!await current()) { note = ''; reason = 'stale-binding'; return outcome() }
  try {
    const action = reply.action
    if (action.kind === 'location') {
      const inspected = await host.inspectFacts(action.request, deadlineMs)
      if (!await current()) { note = ''; reason = 'stale-binding'; return outcome() }
      if (inspected.incomplete) { reason = inspected.failureReason ?? 'source-unavailable'; note += `\n\nRequested supplemental source is unavailable (${reason}); no new source fact is established.` }
      else {
        view = inspected
        let selected = inspected.facts.slice(0, 6)
        if (inspected.facts.length > 6) {
          const waitingAt = await host.now()
          const answer = await ports.ask(localPacketPrompt(inspected))
          if (ports.excludeModelWait) deadlineMs += Math.max(0, await host.now() - waitingAt)
          let value: unknown
          try { value = JSON.parse(answer ?? 'null') } catch { value = null }
          const ids = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 ? (value as { factIds?: unknown }).factIds : null
          if (!Array.isArray(ids) || !ids.length || ids.length > 6 || !ids.every(id => typeof id === 'string' && /^f[1-9]\d*$/.test(id) && Number(id.slice(1)) <= inspected.facts.length)) { selected = []; reason = 'source-selection-unknown' }
          else selected = [...new Set(ids as string[])].map(id => inspected.facts[Number(id.slice(1)) - 1]!)
        }
        sourceFactIds = selected.map(f => f.id)
        note += selected.length ? `\n\nSupplemental verified source excerpts (only this supplied scope; dynamic targets and API behavior remain unverified):\n${selected.map(f => `${f.path}:${f.startLine} [sha256 ${f.fileHash}]\n${f.quote}`).join('\n\n')}` : '\n\nNo supplemental source was selected; the review remains advisory.'
      }
    } else if (action.kind === 'probe') {
      const candidate = parseProbeCandidate(context, action.candidate)
      if (!candidate) { reason = 'invalid-action'; note += '\n\nProbe candidate rejected; nothing was executed.' }
      else {
        if (ports.executionMode !== 'off') {
          snapshot = await captureSnapshot(host, context.binding, deadlineMs)
          if (snapshot && (snapshot.binding.sessionId !== context.binding.sessionId || snapshot.binding.generationId !== context.binding.generationId || snapshot.binding.turnId !== context.binding.turnId || snapshot.binding.taskRevision !== context.binding.taskRevision)) { reason = 'stale-binding'; note = ''; return outcome() }
          if (snapshot && await current()) {
            evidence = await executeProbe(host, { ...candidate, binding: snapshot.binding }, snapshot, { remainingSideCalls: 0, remainingOutputTokens: 0, remainingActiveMs: deadlineMs - await host.now(), deadlineMs })
            if (evidence.outcome === 'unknown') reason = 'execution-unknown'
          } else reason = 'isolation-unavailable'
        }
        note += `\n\n${probeNote(candidate, evidence)}`
      }
    } else if (action.kind === 'recovery') {
      const recovery = buildRecoveryPacket(context, action.observationIds, action.question)
      if (!recovery) { reason = 'invalid-action'; note += '\n\nRecovery evidence is insufficient; no hypothesis was eliminated.' }
      else note += `\n\n${recovery}`
    }
    if (!await current()) { note = ''; reason = 'stale-binding' }
    if (bytesOf(note) > 32768) { note = ''; reason = 'output-limit' }
    return outcome()
  } catch {
    note = ''; reason = 'service-error'
    return outcome()
  }
}


// Historical judgments belong to the task; action evidence belongs to an exact
// source version. Never execute a stale action against the live workspace.
export const historicalReviewOutcome = (context: ReviewContext, reply: ReviewReply, executionMode: ReviewFlowPorts['executionMode'], taskCurrent: () => Promise<boolean>): ReviewOutcome => ({
  note: executionMode === 'shadow' || !reply.judgment ? null : `${reviewNote(context, reply)}\n\nHistorical advice only: current applicability is unknown. Supplemental actions/evidence are not established for the current workspace; no historical test or source excerpt certifies later code. The main assistant may gather fresh evidence or reject this advice with counterevidence.`,
  reason: 'historical-advice', view: null, sourceFactIds: [], evidence: null,
  validate: taskCurrent, cleanup: async () => {},
})
export const runHistoricalReviewFlow = async (context: ReviewContext, reply: ReviewReply, ports: ReviewFlowPorts & { taskCurrent(): Promise<boolean>; sourceCurrent(): Promise<boolean> }): Promise<ReviewOutcome> => {
  if (!await ports.taskCurrent()) return { ...historicalReviewOutcome(context, reply, 'shadow', ports.taskCurrent), reason: 'cancelled' }
  if (!await ports.sourceCurrent()) return historicalReviewOutcome(context, reply, ports.executionMode, ports.taskCurrent)
  const outcome = await runReviewFlow(context, reply, { ...ports, current: async () => await ports.taskCurrent() && await ports.sourceCurrent() })
  if (await ports.taskCurrent() && !await ports.sourceCurrent()) {
    await outcome.cleanup()
    return historicalReviewOutcome(context, reply, ports.executionMode, ports.taskCurrent)
  }
  return outcome
}
