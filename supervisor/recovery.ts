import type { ReviewContext } from './contracts'
import { bytesOf, redact } from '../hooks/prompt'

const observations = (context: ReviewContext) => context.sources.filter(s => s.kind === 'observation').flatMap(s => {
  try {
    const v = JSON.parse(s.text)
    if (v.tool !== 'Bash' || typeof v.input?.command !== 'string' || typeof v.output !== 'string') return []
    const error = v.output.split('\n').find((l: string) => /Error|\bFAIL(?:ED)?\b|\b[1-9]\d* failed\b|undefined|not found|No such file/i.test(l))?.trim() ?? ''
    return [{ id: s.id, command: v.input.command.trim(), output: v.output, failed: v.isError === true || error !== '', signature: error || v.output.trim() }]
  } catch { return [] }
})

export const recoveryObservations = (context: ReviewContext): string[] => {
  const last = observations(context).slice(-3)
  if (last.length !== 3 || !last.every(o => o.failed && o.signature && o.command === last[0]!.command && o.signature === last[0]!.signature)) return []
  return last.map(o => o.id)
}

export const buildRecoveryPacket = (context: ReviewContext, observationIds: string[], question: string): string | null => {
  const actual = recoveryObservations(context)
  if (!actual.length || observationIds.length !== actual.length || new Set(observationIds).size !== actual.length || !actual.every(id => observationIds.includes(id)) || !question.trim() || bytesOf(question) > 2048 || redact(question) !== question) return null
  return [
    'Recovery: the same command produced the same observed failure three times. This does not determine whether the cause is the environment, the implementation or the plan.',
    ...observations(context).filter(o => actual.includes(o.id)).map(o => `Observation ${o.id}: ${o.command}\n${o.output}`),
    'No hypothesis is considered ruled out without a matching observation. Preserve reasonable counterevidence; do not repeat unchanged checks merely because this note exists.',
    `One unresolved question: ${question}`,
    'Main model decides whether to gather evidence, revise the implementation or replan. No further automatic recovery loop follows this packet.',
  ].join('\n\n')
}
