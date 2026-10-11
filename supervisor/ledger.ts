import type { Binding, ExecutionEvidence, IssueState, ProbeCandidate, RequirementRef } from './contracts'
import { sameBinding } from './coordinator'

export const validateObservation = (command: string, saw: string, evidence: ExecutionEvidence, current: Binding) =>
  sameBinding(evidence.binding, current) && evidence.command.trim() === command.trim() && saw.trim() !== '' && !evidence.truncated && evidence.exitCode !== null && evidence.outcome !== 'unknown' && evidence.outcome !== 'environment-error' && `${evidence.stdout}\n${evidence.stderr}`.includes(saw)

export const validateVerdict = (candidate: ProbeCandidate, evidence: ExecutionEvidence, current: Binding, requirements: RequirementRef[]): { status: 'demonstrated' | 'hypothesis' | 'unknown'; reason: string } => {
  if (!sameBinding(candidate.binding, current) || !sameBinding(evidence.binding, current) || candidate.command.trim() !== evidence.command.trim() || evidence.truncated || evidence.exitCode === null || !evidence.checkScope.length || ['environment-error', 'unknown'].includes(evidence.outcome)) return { status: 'unknown', reason: 'execution identity, scope or completeness is unknown' }
  const sourced = candidate.requirementIds.length > 0 && candidate.oracleSourceIds.length > 0 && [...candidate.requirementIds, ...candidate.oracleSourceIds].every(id => requirements.some(r => r.id === id && r.status !== 'inferred' && r.sourceMessageId && r.quote && r.text.includes(r.quote)))
  if (!sourced || candidate.oracle === 'disagreement' || candidate.oracle !== 'existing-test' || candidate.files.length) return { status: 'hypothesis', reason: 'oracle requires independent source validation' }
  return evidence.outcome === 'failed' ? { status: 'demonstrated', reason: 'unchanged source-backed test failed in the matching snapshot' } : { status: 'unknown', reason: 'no counterexample observed in this scope' }
}

export const mergeIssueState = (state: IssueState, tag: 'told' | 'refuted'): IssueState => tag === 'told' ? { ...state, disclosed: true } : { ...state, contested: true }

import type { Track } from '../types'
export const normalizeTrack = (value: unknown): Track | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Track
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 2 || !Number.isSafeInteger(raw.nextId) || raw.nextId < 1 || !Array.isArray(raw.issues) || !Array.isArray(raw.seen) || raw.seen.some(s => typeof s !== 'string')) return null
  if (raw.issues.some(i => !i || !Number.isSafeInteger(i.id) || i.id < 1 || !['open', 'fixed', 'told', 'refuted'].includes(i.status) || !['rule', 'verify'].includes(i.from))) return null
  if (new Set(raw.issues.map(i => i.id)).size !== raw.issues.length || raw.issues.some(i => i.id >= raw.nextId)) return null
  return { ...raw, schemaVersion: 2, runs: Number.isFinite(raw.runs) ? raw.runs : 0, issues: raw.issues.map(i => {
    if (raw.schemaVersion === 2) return i
    return { ...i, status: i.status === 'fixed' ? 'open' : i.status, resolution: i.status === 'fixed' || i.from === 'verify' ? 'unknown' : 'open', disclosed: i.status === 'told', contested: i.status === 'refuted' }
  }) }
}
