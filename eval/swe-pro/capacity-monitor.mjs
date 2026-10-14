import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { capacityTarget } from './capacity.mjs'
import { command } from './docker.mjs'
import { NODE_IMAGE } from './agent.mjs'

export const parseVmMemory = text => {
  const values = Object.fromEntries([...text.matchAll(/^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+) kB$/gm)].map(m => [m[1], Number(m[2]) * 1024]))
  return { total: values.MemTotal, available: values.MemAvailable, swapUsed: values.SwapTotal - values.SwapFree }
}

export const advanceCapacity = (state, sample, maximum) => {
  const target = capacityTarget(state.limit, sample, maximum)
  if (target === 0) return { limit: 0, safeSamples: 0 }
  if (target > state.limit) {
    const safeSamples = state.safeSamples + 1
    return safeSamples >= 3 ? { limit: target, safeSamples: 0 } : { ...state, safeSamples }
  }
  return { ...state, safeSamples: 0 }
}

// Own the runner process and one tiny read-only Linux resource probe. The
// monitor can pause new admission; it never kills a model task on pressure.
const main = async () => {
  const split = process.argv.indexOf('--'), flags = process.argv.slice(2, split), args = process.argv.slice(split + 1)
  if (split < 2 || !args.length || flags.length !== 8) throw Error('Usage: capacity-monitor.mjs --lease PATH --trace PATH --max 8 --initial 6 -- RUN_ARGUMENTS')
  const values = new Map()
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--lease', '--trace', '--max', '--initial'].includes(flags[i]) || values.has(flags[i]) || !flags[i + 1]) throw Error('invalid monitor arguments')
    values.set(flags[i], flags[i + 1])
  }
  const leasePath = resolve(values.get('--lease')), tracePath = resolve(values.get('--trace'))
  const maximum = Number(values.get('--max')), initial = Number(values.get('--initial'))
  if (![maximum, initial].every(Number.isInteger) || initial < 1 || initial > maximum || maximum > 8 || args.includes('--jobs') || args.includes('--capacity-file')) throw Error('invalid monitored admission limits or duplicate runner flags')
  if (leasePath === tracePath) throw Error('lease and trace paths must differ')
  for (const path of [leasePath, tracePath]) mkdirSync(dirname(path), { recursive: true })
  const issuer = randomUUID(), name = `dss-resource-${issuer}`
  const record = event => appendFileSync(tracePath, JSON.stringify({ time: new Date().toISOString(), issuer, ...event }) + '\n')
  const publish = (state, sample) => {
    const lease = { limit: state.limit, expiresAt: Date.now() + 90000, sampledAt: Date.now(), issuer, sample }
    const bytes = JSON.stringify(lease), temporary = `${leasePath}.${issuer}.tmp`
    writeFileSync(temporary, bytes); renameSync(temporary, leasePath)
    record({ type: 'sample', ...lease, leaseSHA256: createHash('sha256').update(bytes).digest('hex') })
  }
  let child, exitCode = 1, state = { limit: initial, safeSamples: 0 }
  const done = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGUSR2']) process.on(signal, () => child ? child.kill(signal) : done.abort())
  record({ type: 'controller', controllerSHA256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'), maximum, initial, sampleIntervalMs: 5000, leaseMs: 90000, increaseAfterSafeSamples: 3, increaseAvailableBytes: 4 * 1024 ** 3, pauseAvailableBytes: 1.5 * 1024 ** 3, increaseSwapBelowBytes: 256 * 1024 ** 2, pauseSwapAboveBytes: 512 * 1024 ** 2, probeImage: NODE_IMAGE })
  try {
    publish({ limit: 0 }, {})
    const probe = await command(['run', '-d', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--memory', '64m', '--cpus', '0.1', '--pids-limit', '32', NODE_IMAGE, 'sleep', 'infinity'])
    if (probe.exitCode !== 0) throw Error('resource probe could not start')
    const sample = async () => {
      const response = await command(['exec', name, 'cat', '/proc/meminfo'], { timeoutMs: 10000 })
      return response.exitCode === 0 ? parseVmMemory(response.stdout) : {}
    }
    const first = await sample()
    // Initial admission also requires headroom; the prior run is not evidence
    // for a different moment or for a failed resource probe.
    if (!(first.available >= 4 * 1024 ** 3 && first.swapUsed < 256 * 1024 ** 2)) state.limit = 0
    publish(state, first)
    if (done.signal.aborted) return
    child = spawn(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url)), ...args, '--jobs', String(maximum), '--capacity-file', leasePath], { stdio: 'inherit' })
    child.once('error', () => done.abort())
    child.once('close', code => { exitCode = code ?? 1; done.abort() })
    while (!done.signal.aborted) {
      try { await delay(5000, undefined, { signal: done.signal }) } catch { break }
      if (done.signal.aborted) break
      const evidence = await sample()
      state = advanceCapacity(state, evidence, maximum)
      publish(state, evidence)
    }
  } finally {
    publish({ limit: 0 }, {})
    await command(['rm', '-f', name], { timeoutMs: 10000 })
    record({ type: 'runner-exit', exitCode })
  }
  process.exitCode = exitCode
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
