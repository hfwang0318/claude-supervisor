import type { Binding, ExecutionEvidence, ModelPair, Snapshot } from './contracts'

export type Host = {
  now(): Promise<number>
  identity(): Promise<{ sessionId: string; workerId: string }>
  cwd(): Promise<string>
  capture(binding: Binding, deadlineMs: number): Promise<Snapshot | null>
  execute(command: string, snapshot: Snapshot, deadlineMs: number, files: { path: string; content: string }[]): Promise<ExecutionEvidence>
  cleanup(snapshot: Snapshot): Promise<void>
  persist(key: string, value: unknown): Promise<void>
  deliver(id: string, text: string): Promise<'delivered' | 'dropped' | 'unknown'>
}

export type ModelAuthorization = { allowed: boolean; reason: string; pair: ModelPair }
