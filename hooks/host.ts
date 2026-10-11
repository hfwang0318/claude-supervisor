import type { ModelPair } from '../supervisor/contracts'
import type { ModelAuthorization } from '../supervisor/ports'

export const authorizeModelPair = (pair: ModelPair, workerId: string): ModelAuthorization => {
  const alias = /^(?:opus|sonnet|haiku|auto|default)$/i
  const reason = !pair.workerId || !pair.sideId || alias.test(pair.workerId) || alias.test(pair.sideId)
    ? 'explicit versioned worker and side model IDs required'
    : !workerId || workerId !== pair.workerId ? 'host worker identity does not match configured pair'
    : pair.relation === 'unverified' || !pair.capabilityProfileId ? 'model capability relationship is unverified'
    : pair.relation === 'same' && pair.sideId !== pair.workerId ? 'same relationship requires identical model IDs'
    : ''
  return { allowed: reason === '', reason, pair }
}

import type { Binding, ExecutionEvidence, Snapshot } from '../supervisor/contracts'
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

export const createHost = (deps: Dependencies): Host => ({
  now: deps.now, identity: deps.identity, cwd: deps.cwd, persist: deps.persist, deliver: deps.deliver,
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
