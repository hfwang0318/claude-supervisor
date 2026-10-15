import type { Binding, ExecutionEvidence, Snapshot, FactRequest, FactView } from './contracts'

export type Host = {
  now(): Promise<number>
  identity(): Promise<{ sessionId: string; workerId: string }>
  cwd(): Promise<string>
  inspectFacts(request: FactRequest, deadlineMs: number, options?: { filesOnly?: boolean }): Promise<FactView>
  validateFacts(view: FactView, deadlineMs: number): Promise<boolean>
  capture(binding: Binding, deadlineMs: number): Promise<Snapshot | null>
  execute(command: string, snapshot: Snapshot, deadlineMs: number, files: { path: string; content: string }[]): Promise<ExecutionEvidence>
  cleanup(snapshot: Snapshot): Promise<void>
  persist(key: string, value: unknown): Promise<void>
  deliver(id: string, text: string): Promise<'delivered' | 'dropped' | 'unknown'>
}

export type ModelSelection = { modelId: string | null; reason: string }
