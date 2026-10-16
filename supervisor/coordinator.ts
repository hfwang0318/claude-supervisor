import type { Binding, DeliveryStatus, JobStatus } from './contracts'

export const sameBinding = (a: Binding, b: Binding) =>
  a.sessionId === b.sessionId && a.generationId === b.generationId && a.turnId === b.turnId && a.taskRevision === b.taskRevision && a.workspaceRevision === b.workspaceRevision && a.snapshotId === b.snapshotId

export const sameTask = (a: Binding, b: Binding) =>
  a.sessionId === b.sessionId && a.generationId === b.generationId && a.turnId === b.turnId && a.taskRevision === b.taskRevision

export class Coordinator {
  private jobs = new Map<string, { status: JobStatus; binding: Binding; controller: AbortController }>()
  private deliveries = new Map<string, DeliveryStatus>()
  private calls = 2
  private tokens = 4000
  private activeMs = 30000
  private startedAt: number | null = null
  private failures = 0

  constructor(public binding: Binding, private policy: { historical?: boolean } = {}) {}

  get historical() { return this.policy.historical === true }
  get modelBudgetAvailable() { return this.calls > 0 && this.tokens > 0 && this.failures < 2 }
  matches(binding: Binding) { return this.historical ? sameTask(binding, this.binding) : sameBinding(binding, this.binding) }

  start(id: string, now: number) {
    if (this.jobs.has(id) || [...this.jobs.values()].some(j => j.status === 'running') || !this.historical && this.activeMs <= 0) return null
    const controller = new AbortController()
    if (this.jobs.size >= 200) {
      const first = [...this.jobs].find(([, job]) => job.status !== 'running')?.[0]
      if (first) this.jobs.delete(first)
    }
    this.jobs.set(id, { status: 'running', binding: { ...this.binding }, controller })
    this.startedAt = now
    return { signal: controller.signal }
  }

  finish(id: string, binding: Binding, status: JobStatus, now?: number): boolean {
    const job = this.jobs.get(id)
    if (!job || job.status !== 'running' || status === 'queued' || status === 'running') return false
    if (!this.matches(binding) || !(this.historical ? sameTask(binding, job.binding) : sameBinding(binding, job.binding))) { job.status = 'stale'; return false }
    job.status = status
    if (now !== undefined && this.startedAt !== null) this.activeMs = Math.max(0, this.activeMs - Math.max(0, now - this.startedAt))
    this.startedAt = null
    return true
  }

  invalidate(binding: Binding, options: { preserveBudget?: boolean; now?: number; reason?: 'cancelled' | 'disabled' } = {}) {
    if (options.preserveBudget && this.startedAt !== null && options.now !== undefined) this.activeMs = Math.max(0, this.activeMs - Math.max(0, options.now - this.startedAt))
    for (const job of this.jobs.values()) if (job.status === 'running') { job.status = 'cancelled'; job.controller.abort(options.reason ?? 'stale-binding') }
    this.jobs.clear()
    this.deliveries.clear()
    this.binding = { ...binding }
    if (!options.preserveBudget) {
      this.calls = 2
      this.tokens = 4000
      this.activeMs = 30000
      this.failures = 0
    }
    this.startedAt = null
  }

  async deliver(id: string, binding: Binding, send: () => Promise<DeliveryStatus>): Promise<DeliveryStatus> {
    const key = `${binding.sessionId}/${binding.generationId}/${binding.turnId}/${id}`
    const old = this.deliveries.get(key)
    if (old) return old === 'prepared' ? 'unknown' : old
    if (!this.matches(binding)) return 'dropped'
    // Reserve before awaiting: concurrent hooks cannot send the same finding twice.
    if (this.deliveries.size >= 200) return 'dropped'
    this.deliveries.set(key, 'prepared')
    let status: DeliveryStatus
    try { status = await send() } catch { status = 'unknown' }
    if (!this.matches(binding) || this.deliveries.get(key) !== 'prepared') return 'dropped'
    this.deliveries.set(key, status === 'prepared' ? 'unknown' : status)
    return this.deliveries.get(key) ?? 'unknown'
  }

  remainingTime(now: number) { return Math.max(0, this.activeMs - (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt))) }

  changedWorkspace(revision: string, now: number) {
    if (this.historical) { this.binding = { ...this.binding, workspaceRevision: revision }; return }
    if (this.startedAt !== null) this.activeMs = Math.max(0, this.activeMs - Math.max(0, now - this.startedAt))
    this.startedAt = null
    for (const job of this.jobs.values()) if (job.status === 'running') { job.status = 'stale'; job.controller.abort('stale-binding') }
    this.binding = { ...this.binding, workspaceRevision: revision }
  }

  reserveCall(now: number, tokens: number, outputAllowance = 0) {
    const elapsed = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt)
    const left = Math.max(0, this.activeMs - elapsed)
    if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isSafeInteger(outputAllowance) || outputAllowance < 0 || this.calls <= 0 || this.tokens <= outputAllowance || !this.historical && left <= 0 || this.failures >= 2) return null
    this.startedAt ??= now
    const maxTokens = Math.min(tokens, this.tokens - outputAllowance)
    const reservedTokens = maxTokens + outputAllowance
    this.calls--
    this.tokens -= reservedTokens // never refund an unconsumed reservation
    return this.historical ? { maxTokens, reservedTokens } : { maxTokens, reservedTokens, timeoutMs: left }
  }

  pauseModel(binding: Binding, now: number) {
    if (!this.historical || !sameTask(binding, this.binding) || ![...this.jobs.values()].some(j => j.status === 'running' && sameTask(j.binding, binding))) return
    if (this.startedAt !== null) this.activeMs = Math.max(0, this.activeMs - Math.max(0, now - this.startedAt))
    this.startedAt = null
  }

  resumeModel(binding: Binding, now: number) {
    if (this.historical && sameTask(binding, this.binding) && [...this.jobs.values()].some(j => j.status === 'running' && sameTask(j.binding, binding))) this.startedAt ??= now
  }

  chargeActivity(binding: Binding, elapsedMs: number) {
    if (sameTask(binding, this.binding) && Number.isFinite(elapsedMs) && elapsedMs >= 0) this.activeMs = Math.max(0, this.activeMs - elapsedMs)
  }

  recordUsage(tokens: number, reservedTokens: number) {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isSafeInteger(reservedTokens) || reservedTokens < 1) { this.failures = 2; return false }
    const excess = Math.max(0, tokens - reservedTokens)
    this.tokens = Math.max(0, this.tokens - excess)
    if (excess > 0) { this.failures = 2; return false }
    return true
  }
  recordFailure() { this.failures++ }
}
