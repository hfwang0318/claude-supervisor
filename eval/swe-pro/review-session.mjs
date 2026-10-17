import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { openSync, readSync, closeSync, statSync, mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const journalPayload = (line, kind) => {
  const prefix = /^\S+ \[DEBUG\] \[deepseek-supervisor\] \$\.ui\.log \(to debug\): deepseek-supervisor: (REVIEW_LIFECYCLE|REVIEW_CONTROL) (\{.*\})$/.exec(line)
  if (!prefix || prefix[1] !== kind) return null
  try { return JSON.parse(prefix[2]) } catch { return null }
}
export const parseReviewLifecycle = line => {
  const value = journalPayload(line, 'REVIEW_LIFECYCLE')
  if (value?.acceptedFollowUps !== undefined && (!Number.isSafeInteger(value.acceptedFollowUps) || value.acceptedFollowUps < 0)) return null
  return value && typeof value.active === 'boolean' && Number.isInteger(value.followUps) && value.followUps >= 0 && value.followUps <= 1 ? { active: value.active, followUps: value.followUps, ...(value.acceptedFollowUps === undefined ? {} : { acceptedFollowUps: value.acceptedFollowUps }) } : null
}
export const parseReviewControl = line => {
  const value = journalPayload(line, 'REVIEW_CONTROL')
  if (!value || !['ready', 'cancelled', 'unavailable'].includes(value.status)) return null
  return value.status === 'unavailable' || Number.isSafeInteger(value.revision) && value.revision >= 0 ? { revision: value.revision, status: value.status } : null
}
export class ReviewInputGate {
  revision = -1
  error = null
  waiting = new Map()
  wait(revision) {
    if (this.error) return Promise.reject(this.error)
    if (this.revision >= revision) return Promise.resolve()
    return new Promise((resolve, reject) => this.waiting.set(revision, { resolve, reject }))
  }
  observe(value) {
    if (this.error) return
    if (value.status === 'unavailable') return this.fail(new Error('review input channel unavailable'))
    // Ready establishes only the initial handshake. Later inputs require a
    // cancellation acknowledgement, not a replayed plugin-start event.
    if (value.status === 'ready' && value.revision !== 0) return
    this.revision = Math.max(this.revision, value.revision)
    for (const [revision, item] of this.waiting) if (revision <= this.revision) { this.waiting.delete(revision); item.resolve() }
  }
  fail(error) {
    this.error = error
    for (const item of this.waiting.values()) item.reject(error)
    this.waiting.clear()
  }
}
export const reviewSessionCanClose = (results, lifecycle, expected = { inputs: 1, followUps: lifecycle?.acceptedFollowUps ?? 0 }) => !!lifecycle && !lifecycle.active && results >= expected.inputs + expected.followUps

// The adapter owns only this session's lifetime and input cancellation. It never
// calls a provider, reads credentials, retries a model or implements native input.
// --review-stream-input accepts native JSONL frames; the default remains one raw
// task instruction for SWE Pro. New input is forwarded only after old review work
// has been revoked through the plugin's optional, cancel-only private file.
// A native result may explicitly cover several user frames adopted into one
// turn. Count that evidence, never infer coalescing from elapsed time or idleness.
export class ReviewResultCoverage {
  submitted = new Set()
  covered = new Set()
  inputResults = 0
  reliable = true
  submit(id) {
    if (typeof id !== 'string' || !id || this.submitted.has(id) || this.submitted.size >= 4096) { this.reliable = false; return }
    this.submitted.add(id)
  }
  observe(value) {
    if (!this.reliable || value?.type !== 'result' || !Array.isArray(value.user_message_uuids)) return
    const ids = value.user_message_uuids
    if (!ids.every(id => typeof id === 'string') || new Set(ids).size !== ids.length) { this.reliable = false; return }
    const adopted = ids.filter(id => this.submitted.has(id))
    if (!adopted.length) return
    this.inputResults++
    for (const id of adopted) this.covered.add(id)
  }
  effectiveInputs(inputs) {
    if (!this.reliable || !this.covered.size) return inputs
    if (this.covered.size !== this.submitted.size) return null
    return inputs - Math.max(0, this.covered.size - this.inputResults)
  }
}

export const runReviewSession = async (argv, input = process.stdin, output = process.stdout) => {
  const streamInput = argv.includes('--review-stream-input')
  argv = argv.filter(arg => arg !== '--review-stream-input')
  const debugAt = argv.indexOf('--debug-file'), debugFile = argv[debugAt + 1]
  if (debugAt < 0 || !debugFile) throw Error('historical session requires a debug lifecycle journal')
  input.setEncoding?.('utf8')
  let instruction = ''
  if (!streamInput) for await (const chunk of input) {
    instruction += chunk
    if (Buffer.byteLength(instruction) > 1024 * 1024) throw Error('instruction limit')
  }
  const directory = mkdtempSync(join(tmpdir(), 'supervisor-input-'))
  const controlFile = join(directory, 'control.json')
  const announce = revision => {
    const temporary = join(directory, 'next.json')
    writeFileSync(temporary, JSON.stringify({ version: 1, revision }), { mode: 0o600 })
    renameSync(temporary, controlFile)
  }
  announce(0)
  let journalStart = 0
  try { journalStart = statSync(debugFile).size } catch { /* New journal. */ }
  const child = spawn(argv[0], [...argv.slice(1), '--input-format', 'stream-json'], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, DEEPSEEK_SUPERVISOR_CONTROL_FILE: controlFile } })
  const gate = new ReviewInputGate()
  const coverage = new ReviewResultCoverage()
  let results = 0, inputCount = 0, followUpCount = 0, lifecycle = null, offset = journalStart, journal = '', response = '', closed = false, inputDone = false, inputBusy = true, revision = 0
  const inspect = () => {
    try {
      const size = statSync(debugFile).size
      if (size < offset) { offset = 0; journal = ''; lifecycle = null }
      const fd = openSync(debugFile, 'r')
      try {
        while (offset < size) {
          const bytes = Buffer.alloc(Math.min(size - offset, 65536)), n = readSync(fd, bytes, 0, bytes.length, offset)
          if (!n) break
          offset += n; journal += bytes.subarray(0, n).toString('utf8')
          let at
          while ((at = journal.indexOf('\n')) >= 0) {
            const line = journal.slice(0, at); journal = journal.slice(at + 1)
            const value = parseReviewLifecycle(line)
            if (value) {
              followUpCount = Math.max(followUpCount, value.acceptedFollowUps ?? 0)
              lifecycle = value
            }
            const control = parseReviewControl(line)
            if (control) gate.observe(control)
          }
          if (journal.length > 65536) journal = ''
        }
      } finally { closeSync(fd) }
    } catch { /* Native startup may not have created its journal yet. */ }
    const effectiveInputs = coverage.effectiveInputs(inputCount)
    if (!closed && inputDone && !inputBusy && effectiveInputs !== null && reviewSessionCanClose(results, lifecycle, { inputs: effectiveInputs, followUps: followUpCount })) { closed = true; child.stdin.end() }
  }
  child.stdout.on('data', chunk => {
    output.write(chunk); response += chunk.toString('utf8')
    let at
    while ((at = response.indexOf('\n')) >= 0) {
      const line = response.slice(0, at); response = response.slice(at + 1)
      try { const value = JSON.parse(line); if (value.type === 'result') { results++; coverage.observe(value) } } catch { /* Native diagnostic, not a result. */ }
    }
    if (response.length > 8 * 1024 * 1024) response = ''
    inspect()
  })
  child.stdin.on('error', () => {})
  const poll = setInterval(inspect, 50)
  let inputError, nativeEnded = false
  void (async () => {
    await gate.wait(0)
    let seenUser = false
    const send = async line => {
      inputBusy = true
      const frame = JSON.parse(line)
      if (frame.type === 'user' || frame.type === 'control_request' && frame.request?.subtype === 'interrupt') {
        if (seenUser) { announce(++revision); await gate.wait(revision) }
        if (frame.type === 'user') {
          seenUser = true; inputCount++
          if (frame.uuid === undefined) frame.uuid = randomUUID()
          coverage.submit(frame.uuid)
        }
      }
      if (closed || nativeEnded) throw Error('native input already closed')
      child.stdin.write(JSON.stringify(frame) + '\n')
      inputBusy = false
    }
    if (streamInput) {
      let buffer = ''
      for await (const chunk of input) {
        buffer += chunk.toString()
        if (Buffer.byteLength(buffer) > 1024 * 1024) throw Error('input frame limit')
        let at
        while ((at = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 1)
          if (line.trim()) await send(line)
        }
      }
      if (buffer.trim()) await send(buffer)
    } else await send(JSON.stringify({ type: 'user', message: { role: 'user', content: instruction } }))
    inputBusy = false; inputDone = true; inspect()
  })().catch(error => { if (!nativeEnded) { inputError = error; child.kill('SIGTERM') } })
  const terminate = () => child.kill('SIGTERM')
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate)
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', error => { nativeEnded = true; gate.fail(error); input.destroy?.(); reject(error) })
      child.once('close', (code, signal) => { nativeEnded = true; closed = true; gate.fail(new Error('native session ended')); input.destroy?.(); resolve({ code: code ?? 1, signal, results, lifecycle }) })
    })
    // Native exit ends this adapter's input ownership too; destroy wakes a
    // pending iterator and releases stdin without replacing the child's status.
    if (inputError) throw inputError
    return result
  } finally {
    clearInterval(poll)
    process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', terminate)
    rmSync(directory, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runReviewSession(process.argv.slice(2))
  process.exitCode = result.code
}
