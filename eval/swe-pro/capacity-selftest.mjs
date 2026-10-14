import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const api = await import('./capacity.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e })
assert.equal(typeof api.adaptiveMap, 'function', 'active tasks must survive capacity changes and graceful queue draining')
const root = mkdtempSync(join(tmpdir(), 'swe-capacity-')), path = join(root, 'lease.json')
try {
  const write = limit => writeFileSync(path, JSON.stringify({ limit, expiresAt: Date.now() + 60000 }))
  write(6)
  let active = 0, peak = 0, releases = [], starts = []
  const controller = new AbortController()
  const run = api.adaptiveMap(Array.from({ length: 12 }, (_, i) => i), 8, async (i, index, meta) => {
    starts.push(i); active++; peak = Math.max(peak, active)
    assert(meta.activeWorkers <= meta.limit)
    await new Promise(ok => releases.push(ok)); active--
  }, { capacityFile: path, signal: controller.signal, pollMs: 1 })
  await new Promise(ok => setTimeout(ok, 20))
  assert.equal(starts.length, 6)
  write(8)
  await new Promise(ok => setTimeout(ok, 20))
  assert.equal(starts.length, 8)
  assert.equal(peak, 8)
  write(0)
  releases.splice(0).forEach(ok => ok())
  await new Promise(ok => setTimeout(ok, 20))
  assert.equal(starts.length, 8, 'lowering capacity parks pending work without restarting or cancelling active work')
  controller.abort()
  await run
  assert.equal(active, 0)
  writeFileSync(path, JSON.stringify({ limit: 8, expiresAt: Date.now() - 1 }))
  assert.equal(api.readCapacity(path, 8), 0, 'stale monitoring cannot dispatch paid tasks')
  writeFileSync(path, 'broken')
  assert.equal(api.readCapacity(path, 8), 0)
  write(9)
  assert.equal(api.readCapacity(path, 8), 0)
  const GiB = 1024 ** 3
  assert.equal(api.capacityTarget(6, { available: 5 * GiB, swapUsed: 0 }, 8), 7)
  assert.equal(api.capacityTarget(6, { available: GiB, swapUsed: 0 }, 8), 0)
  assert.equal(api.capacityTarget(6, { available: 5 * GiB, swapUsed: GiB }, 8), 0)
  assert.equal(api.capacityTarget(6, {}, 8), 0)
  assert.equal(typeof api.admissionPolicy, 'function', 'adaptive admission must remain recorded at one or two workers')
  assert.equal(api.admissionPolicy({ concurrency: 2, capacityFile: path }).capacityFile, path)
  const signals = join(root, 'signals.mjs')
  writeFileSync(signals, `import { registerDrainSignals } from ${JSON.stringify(new URL('./capacity.mjs', import.meta.url).href)}
const task = new AbortController(), queue = new AbortController()
registerDrainSignals(task, queue, () => {})
process.kill(process.pid, 'SIGUSR2')
setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 10)
setTimeout(() => { if (!queue.signal.aborted || task.signal.aborted) process.exit(1); console.log('active work completed') }, 40)
`)
  const drained = spawnSync(process.execPath, [signals], { encoding: 'utf8', timeout: 2000 })
  assert.equal(drained.status, 0, 'repeated graceful drain signals must not terminate active work')
  assert.match(drained.stdout, /active work completed/)
} finally { rmSync(root, { recursive: true, force: true }) }
console.log('SWE Pro adaptive capacity self-tests passed')
