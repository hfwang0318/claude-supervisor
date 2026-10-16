import { spawn } from 'node:child_process'
import { openSync, readSync, closeSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const parseReviewLifecycle = line => {
  const match = /^\S+ \[DEBUG\] \[deepseek-supervisor\] \$\.ui\.log \(to debug\): deepseek-supervisor: REVIEW_LIFECYCLE (\{.*\})$/.exec(line)
  if (!match) return null
  try {
    const value = JSON.parse(match[1])
    return typeof value.active === 'boolean' && Number.isInteger(value.followUps) && value.followUps >= 0 && value.followUps <= 1 ? { active: value.active, followUps: value.followUps } : null
  } catch { return null }
}
export const reviewSessionCanClose = (results, lifecycle) => !!lifecycle && !lifecycle.active && results >= lifecycle.followUps + 1

// Keep the native headless session bound for historical followups. The caller's
// observation/process boundary remains authoritative; this driver adds no model
// waiting timeout and does not retry an unanswered review.
export const runReviewSession = async (argv, input = process.stdin, output = process.stdout) => {
  const debugAt = argv.indexOf('--debug-file'), debugFile = argv[debugAt + 1]
  if (debugAt < 0 || !debugFile) throw Error('historical session requires a debug lifecycle journal')
  let instruction = ''
  for await (const chunk of input) {
    instruction += chunk
    if (Buffer.byteLength(instruction) > 1024 * 1024) throw Error('instruction limit')
  }
  const child = spawn(argv[0], [...argv.slice(1), '--input-format', 'stream-json'], { stdio: ['pipe', 'pipe', 'inherit'] })
  let results = 0, lifecycle = null, offset = 0, journal = '', response = '', closed = false
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
            if (value) lifecycle = value
          }
          if (journal.length > 65536) journal = ''
        }
      } finally { closeSync(fd) }
    } catch { /* The debug journal may not exist until native startup. */ }
    if (!closed && reviewSessionCanClose(results, lifecycle)) { closed = true; child.stdin.end() }
  }
  child.stdout.on('data', chunk => {
    output.write(chunk); response += chunk.toString('utf8')
    let at
    while ((at = response.indexOf('\n')) >= 0) {
      const line = response.slice(0, at); response = response.slice(at + 1)
      try { if (JSON.parse(line).type === 'result') results++ } catch { /* Native diagnostic line, not a result. */ }
    }
    if (response.length > 8 * 1024 * 1024) response = ''
    inspect()
  })
  child.stdin.on('error', () => {}) // Native process may end before its input closes.
  child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: instruction } }) + '\n')
  const poll = setInterval(inspect, 50)
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code: code ?? 1, signal, results, lifecycle }))
    })
  } finally { clearInterval(poll) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runReviewSession(process.argv.slice(2))
  process.exitCode = result.code
}
