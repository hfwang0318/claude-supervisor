import type { ReviewContext, ProbeCandidate, ExecutionEvidence } from './contracts'
import { bytesOf, redact, probeRefusal } from '../hooks/prompt'
import { isCheckCommand } from '../hooks/evidence'

const textOK = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && bytesOf(v) <= max && redact(v) === v
export const parseProbeCandidate = (context: ReviewContext, value: unknown): ProbeCandidate | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => !['question', 'requirementQuote', 'command', 'location', 'current', 'required', 'files', 'oracle', 'oracleExplanation', 'sourceIds'].includes(k)) || !['question', 'requirementQuote', 'oracleExplanation'].every(k => textOK(v[k], 4096)) || !textOK(v.command, 4096)) return null
  if (!context.sources.find(s => s.id === 'req')?.text.includes(v.requirementQuote as string) || probeRefusal(v.command, isCheckCommand(v.command)) !== undefined) return null
  if (!['existing-test', 'spec-example', 'invariant', 'disagreement'].includes(v.oracle as string) || !Array.isArray(v.sourceIds) || !v.sourceIds.length || v.sourceIds.length > 8 || !v.sourceIds.every(id => typeof id === 'string' && context.sources.some(s => s.id === id))) return null
  if (!Array.isArray(v.files) || v.files.length > 3 || v.files.some(f => !f || typeof f !== 'object' || Object.keys(f).some(k => !['path', 'content'].includes(k)) || !/^__supervisor_probes\/[A-Za-z0-9_/-]+\.(?:py|js|mjs|cjs|sh)$/.test(f.path) || f.path.includes('..') || !textOK(f.content, 65536))) return null
  const optional = ['location', 'current', 'required'].filter(k => v[k] !== undefined)
  if (optional.some(k => !textOK(v[k], 4096))) return null
  const files = v.files as { path: string; content: string }[]
  if (new Set(files.map(f => f.path)).size !== files.length || files.reduce((n, f) => n + bytesOf(f.content), 0) > 65536) return null
  if (v.oracle === 'existing-test' && (!context.sources.some(s => ['tool', 'observation'].includes(s.kind) && s.text.includes(v.command as string)) || files.length)) return null
  return { id: `probe-${context.binding.turnId}`, binding: { ...context.binding }, requirementIds: ['req'], question: v.question as string, command: v.command, ...(v.location !== undefined ? { location: v.location as string } : {}), ...(v.current !== undefined ? { current: v.current as string } : {}), ...(v.required !== undefined ? { required: v.required as string } : {}), files, oracle: v.oracle as ProbeCandidate['oracle'], oracleExplanation: `${v.requirementQuote}\n${v.oracleExplanation}`, oracleSourceIds: [...new Set(v.sourceIds as string[])] }
}

export const probeNote = (candidate: ProbeCandidate, evidence: ExecutionEvidence | null) => [
  `Probe question: ${candidate.question}`,
  `Requirement/source rationale (hypothesis, not an independently authenticated oracle): ${candidate.oracleExplanation}`,
  `Command: ${candidate.command}`,
  ...(candidate.location ? [`Location: ${candidate.location}`] : []),
  ...(candidate.current ? [`Current: ${candidate.current}`] : []),
  ...(candidate.required ? [`Required: ${candidate.required}`] : []),
  ...(evidence ? [`Independent snapshot observation: ${evidence.outcome}; exit=${evidence.exitCode ?? 'unknown'}; truncated=${evidence.truncated}.`, `Output:\n${evidence.stdout}\n${evidence.stderr}`] : ['This probe was not executed. Main model may decide whether to run it under the user\'s existing authorization.', ...candidate.files.map(f => `Suggested file, not written: ${f.path}\n${f.content}`)]),
  'Generated expectations and behavior interpretations remain a hypothesis. Environment/import errors, missing files, timeouts and incomplete observations do not prove a behavior defect. A passing probe covers only this input/scope, not repair correctness.',
].join('\n\n')
