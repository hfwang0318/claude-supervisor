import { bytesOf, redact } from '../hooks/prompt'
import { evidenceOf } from '../hooks/evidence'
import type { ReviewSource } from './contracts'

export type ReviewTrigger = 'interval' | 'first-write' | 'failure' | 'verification' | 'completion'
export type ReviewOpportunity<T = unknown> = { frame?: T; reasons: ReviewTrigger[]; sources: ReviewSource[]; omitted: string[]; sequence: number; newSourceIds: string[]; priorAnchorIds: string[] }

// Match async-generator delegation: consumer return closes upstream, consumer
// throw reaches its handler, and all chunks (including opaque ones) pass through.
export async function* observeStream<C, R>(stream: AsyncGenerator<C, R, unknown>, observe: (chunk: C) => void): AsyncGenerator<C, R, unknown> {
  let completed = false
  try {
    let item = await stream.next()
    while (true) {
      if (item.done) { completed = true; return item.value }
      observe(item.value)
      let value: unknown
      try { value = yield item.value }
      catch (error) { item = await stream.throw(error); continue }
      item = await stream.next(value)
    }
  } finally {
    if (!completed) await stream.return(undefined as never)
  }
}

// Public callback records only. A checkpoint is immutable once offered; later
// ordinary work coalesces without replacing an earlier milestone's evidence.
export class IncrementalReview<T = unknown> {
  private seen = new Set<string>()
  private steps = new Set<string>()
  private milestones = new Set<string>()
  private sources: ReviewSource[] = []
  private anchors: ReviewSource[] = []
  private omitted = new Set<string>()
  private pinned: ReviewOpportunity<T>[] = []
  private ordinary: ReviewOpportunity<T> | null = null
  private count = 0
  private sequence = 0
  private lastTakenSequence = 0
  private dirty = false

  constructor(readonly interval = 5) {
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 100) throw Error('invalid review interval')
  }
  reset() {
    this.seen.clear(); this.steps.clear(); this.milestones.clear()
    this.sources = []; this.anchors = []; this.omitted.clear(); this.pinned = []; this.ordinary = null
    this.count = 0; this.sequence = 0; this.lastTakenSequence = 0; this.dirty = false
  }
  add(key: string, kind: ReviewSource['kind'], text: string) {
    if (!text.trim() || this.seen.has(key)) return
    // Bounded identity sets: exhaustion stops admission rather than re-admitting
    // ancient duplicate events after eviction.
    if (this.seen.size >= 4096) { this.omitted.add('incremental-event-limit'); return }
    this.seen.add(key)
    if (redact(text) !== text) { this.omitted.add('privacy-affected-incremental-material'); return }
    if (bytesOf(text) > 16384) { this.omitted.add('incremental-material-budget'); return }
    if (this.sources.some(source => source.text === text && (source.kind === kind || kind === 'narrative' && source.kind === 'answer'))) return
    if (kind === 'answer') this.sources = this.sources.filter(source => source.kind !== 'narrative' || source.text !== text)
    const source = { id: `event-${++this.sequence}`, kind, text }
    this.sources.push(source)
    // Existing check recognition selects historical material only. It grants no
    // verification, repair, command equivalence or current-source authority.
    if (kind === 'observation') {
      try {
        const use = JSON.parse(text)
        if (use.completed === true && use.truncated !== true && use.tool === 'Bash' && evidenceOf([{ role: 'assistant', text: '', toolUses: [{ tool: use.tool, input: use.input, text: use.output, result: { exitCode: use.exitCode } }] }]).runs.length) {
          this.anchors.push(source)
          while (this.anchors.length > 8 || bytesOf(JSON.stringify(this.anchors)) > 8192) { this.anchors.shift(); this.omitted.add('incremental-anchor-budget') }
        }
      } catch { /* Unstructured observations remain ordinary bounded records. */ }
    }
    this.dirty = true
    while (this.sources.length > 32 || bytesOf(JSON.stringify(this.sources)) > 24576) {
      this.sources.shift(); this.omitted.add('incremental-material-budget')
    }
  }
  step(key: string, text: string, frame?: T, admit = true) {
    if (this.steps.has(key) || this.steps.size >= 4096) return
    this.steps.add(key)
    this.add(`step-${key}`, 'narrative', text)
    if (++this.count >= this.interval && this.dirty && admit) this.request('interval', 'interval', frame)
  }
  request(reason: ReviewTrigger, key: string = reason, frame?: T) {
    if (!this.dirty || !this.sources.length) return
    const milestone = `${reason}:${key}`
    if (reason !== 'interval' && this.milestones.has(milestone)) return
    const selected: ReviewSource[] = []
    for (const source of [this.sources.at(-1)!, ...this.anchors.toReversed(), ...this.sources.toReversed()]) {
      if (selected.some(s => s.id === source.id)) continue
      if (selected.length >= 32 || bytesOf(JSON.stringify([...selected, source])) > 24576) { this.omitted.add('incremental-material-budget'); continue }
      selected.push({ ...source })
    }
    selected.sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)))
    const opportunity: ReviewOpportunity<T> = { frame, reasons: [reason], sources: selected, omitted: ['incremental-public-record-window', ...this.omitted], sequence: this.sequence, newSourceIds: [], priorAnchorIds: [] }
    if (reason === 'interval') this.ordinary = opportunity
    else {
      if (this.milestones.size >= 4096) { this.omitted.add('incremental-event-limit'); return }
      this.milestones.add(milestone)
      // Bounded pending milestones; never silently lose the first-write snapshot.
      if (this.pinned.length >= 4) {
        const disposable = this.pinned.findIndex(p => !p.reasons.includes('first-write') && !p.reasons.includes('completion'))
        this.pinned.splice(disposable >= 0 ? disposable : this.pinned.findIndex(p => !p.reasons.includes('first-write')), 1)
        this.omitted.add('pending-milestone-budget')
        opportunity.omitted.push('pending-milestone-budget')
      }
      this.pinned.push(opportunity)
      // The milestone contains the preceding ordinary evidence too.
      this.ordinary = null
    }
    this.dirty = false; this.count = 0
  }
  take(): ReviewOpportunity<T> | null {
    const opportunity = this.pinned.length ? this.pinned.shift()! : this.ordinary
    if (opportunity === this.ordinary) this.ordinary = null
    if (!opportunity) return null
    const prior = (source: ReviewSource) => Number(source.id.slice(6)) <= this.lastTakenSequence
    opportunity.newSourceIds = opportunity.sources.filter(source => !prior(source)).map(source => source.id)
    opportunity.priorAnchorIds = opportunity.sources.filter(prior).map(source => source.id)
    this.lastTakenSequence = Math.max(this.lastTakenSequence, opportunity.sequence)
    return opportunity
  }
  omit(reason: string) { this.omitted.add(reason) }
  clearPending() { this.pinned = []; this.ordinary = null }
  get pending() { return this.pinned.length > 0 || this.ordinary !== null }
}
