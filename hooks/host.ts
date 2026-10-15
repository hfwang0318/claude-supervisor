import type { ModelSelection } from '../supervisor/ports'

export const selectSideModel = (configured: string, workerId: string): ModelSelection => {
  const modelId = configured.trim() || workerId.trim() || null
  return { modelId, reason: modelId === null ? 'worker model unavailable; choose a side model explicitly' : '' }
}

import type { Binding, ExecutionEvidence, Snapshot, FactView, FactInspectionFailure } from '../supervisor/contracts'
import type { Host } from '../supervisor/ports'
import { classifyOutput } from '../supervisor/runner'

type Dependencies = {
  now(): Promise<number>
  identity(): Promise<{ sessionId: string; workerId: string }>
  cwd(): Promise<string>
  service(request: Record<string, unknown>, deadlineMs: number): Promise<unknown>
  persist(key: string, value: unknown): Promise<void>
  deliver(id: string, text: string): Promise<'delivered' | 'dropped' | 'unknown'>
  sanitize(text: string): string
}

const INSPECTION_FAILURES: readonly FactInspectionFailure[] = ['invalid-request', 'deadline', 'unsafe-path', 'symlink', 'source-missing', 'source-type', 'file-limit', 'read-limit', 'traversal-limit', 'selected-file-limit', 'source-changed', 'secret-content', 'output-limit', 'no-facts', 'validation-failed', 'inspection-error']
const incompleteView = (failureReason: FactInspectionFailure): FactView => ({ facts: [], files: [], manifestHash: '', incomplete: true, failureReason })

export const createHost = (deps: Dependencies): Host => ({
  now: deps.now, identity: deps.identity, cwd: deps.cwd, persist: deps.persist, deliver: deps.deliver,
  inspectFacts: async (request, deadlineMs, options) => {
    const value = await deps.service({ action: 'inspect', root: await deps.cwd(), request, deadlineMs, ...(options?.filesOnly ? { filesOnly: true } : {}) }, deadlineMs) as FactView
    if (!value || !Array.isArray(value.facts) || !Array.isArray(value.files)) return incompleteView('invalid-view')
    if (value.incomplete !== false) return incompleteView(INSPECTION_FAILURES.includes(value.failureReason as FactInspectionFailure) ? value.failureReason as FactInspectionFailure : 'inspection-unknown')
    if (deps.sanitize(JSON.stringify(value)) !== JSON.stringify(value)) return incompleteView('redaction-rejected')
    return value
  },
  validateFacts: async (view, deadlineMs) => await deps.service({ action: 'validate-facts', root: await deps.cwd(), view, deadlineMs }, deadlineMs) === true,
  capture: async (binding: Binding, deadlineMs: number) => {
    const value = await deps.service({ action: 'capture', root: await deps.cwd(), binding, deadlineMs }, deadlineMs) as Snapshot
    if (!value?.id || !value.root || !value.binding) return null
    return value
  },
  cleanup: async snapshot => { await deps.service({ action: 'cleanup', snapshot }, await deps.now() + 2000) },
  execute: async (command, snapshot, deadlineMs, files) => {
    const value = await deps.service({ action: 'execute', command, snapshot, files, deadlineMs }, deadlineMs) as {
      exitCode: number | null; stdout: string; stderr: string; truncated: boolean; startedAt: number; endedAt: number; current: boolean; unchanged: boolean; cancelled: boolean
    }
    if (!value || typeof value.stdout !== 'string' || typeof value.stderr !== 'string') throw Error('unreadable execution result')
    const outcome = value.current && value.unchanged && !value.cancelled ? classifyOutput(value.exitCode, `${value.stdout}\n${value.stderr}`, value.truncated) : 'unknown'
    const evidence: ExecutionEvidence = { id: `${snapshot.id}:${value.startedAt}`, binding: snapshot.binding, command, cwd: snapshot.root, checkScope: [command.trim()], exitCode: value.exitCode, stdout: deps.sanitize(value.stdout), stderr: deps.sanitize(value.stderr), truncated: value.truncated, outcome, startedAt: value.startedAt, endedAt: value.endedAt }
    return evidence
  }
})
