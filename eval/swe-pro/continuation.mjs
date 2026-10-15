import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateResult } from './run-state.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const code = dirname(fileURLToPath(import.meta.url))
const adapterFiles = root => readdirSync(root).filter(n => n.endsWith('.mjs')).sort()
export const adapterFingerprint = root => hash(adapterFiles(root).map(n => `${n}:${hash(readFileSync(join(root, n)))}`).join('\n'))
const verifyExecutionAdapter = (previous, current, sourceAdapter, currentAdapter) => {
  if (!sourceAdapter) throw Error('continuation requires the original frozen adapter directory')
  const source = resolve(sourceAdapter), target = resolve(currentAdapter)
  if (adapterFingerprint(source) !== previous || adapterFingerprint(target) !== current) throw Error('continuation adapter fingerprint mismatch')
  const scheduling = new Set(['run.mjs', 'run-state.mjs', 'continuation.mjs', 'continuation-selftest.mjs', 'schedule-selftest.mjs', 'capacity.mjs', 'capacity-selftest.mjs', 'capacity-monitor.mjs', 'capacity-monitor-selftest.mjs'])
  const unchanged = [...new Set([...adapterFiles(source), ...adapterFiles(target)])].filter(n => !scheduling.has(n)).sort()
  for (const name of unchanged) {
    if (!existsSync(join(source, name)) || !existsSync(join(target, name)) || hash(readFileSync(join(source, name))) !== hash(readFileSync(join(target, name)))) throw Error(`continuation execution adapter changed: ${name}`)
  }
  return { sourceAdapterOut: source, executionAdapterSHA256: hash(unchanged.map(n => `${n}:${hash(readFileSync(join(target, n)))}`).join('\n')) }
}
const stableConfiguration = (config, allowMemoryChange = false) => {
  const stable = { ...config }
  for (const field of ['concurrency', 'adapterSHA256', 'memoryPolicy', 'continuation']) delete stable[field]
  if (allowMemoryChange) {
    if (!Number.isSafeInteger(stable.environment?.memoryBytes) || stable.environment.memoryBytes <= 0) throw Error('invalid VM memory configuration')
    const { memoryBytes, ...environment } = stable.environment
    stable.environment = environment
  }
  return stable
}

// An explicit new phase may change scheduling, never the model, plugin, task
// material, per-task budgets or physical environment. Original receipts stay
// in their source directory and retain their original experiment fingerprint.
export const loadContinuation = (source, config, jobs, { sourceAdapter, currentAdapter = code, excludeUnproductive = false, allowMemoryChange = false, visited = new Set() } = {}) => {
  const sourceOut = resolve(source), bytes = readFileSync(join(sourceOut, 'experiment.json'))
  if (visited.has(sourceOut)) throw Error('continuation cycle')
  visited = new Set([...visited, sourceOut])
  const previous = JSON.parse(bytes)
  if (previous.incremental || config.incremental) throw Error('continuation requires a full baseline')
  if (JSON.stringify(stableConfiguration(previous, allowMemoryChange)) !== JSON.stringify(stableConfiguration(config, allowMemoryChange))) throw Error('continuation configuration changed beyond scheduling or explicitly permitted VM memory')
  const adapter = verifyExecutionAdapter(previous.adapterSHA256, config.adapterSHA256, sourceAdapter, currentAdapter)
  const inherited = previous.continuation ? loadContinuation(previous.continuation.sourceOut, previous, jobs, { sourceAdapter: previous.continuation.sourceAdapterOut, currentAdapter: sourceAdapter, excludeUnproductive: previous.continuation.excludeUnproductive === true, allowMemoryChange: previous.continuation.allowMemoryChange === true, visited }) : undefined
  if (inherited) for (const [key, value] of Object.entries(previous.continuation)) if (JSON.stringify(inherited.identity[key]) !== JSON.stringify(value)) throw Error('inherited continuation binding changed')
  const fingerprint = hash(JSON.stringify(previous)), completed = new Map(), origins = new Map(), receipts = [], excluded = []
  for (const { task, mode } of jobs) {
    const key = `${task.instanceId}/${mode}`, dir = join(sourceOut, key), path = join(dir, 'result.json')
    if (inherited?.completed.has(key)) {
      if (existsSync(dir)) throw Error('duplicate inherited source attempt')
      completed.set(key, inherited.completed.get(key)); origins.set(key, inherited.origins.get(key))
      receipts.push([key, inherited.origins.get(key).resultSHA256])
      continue
    }
    if (!existsSync(path)) {
      if (existsSync(dir)) throw Error(`unfinished source attempt: ${key}; stop and preserve it first`)
      continue
    }
    const resultBytes = readFileSync(path), row = JSON.parse(resultBytes)
    validateResult(row, task, mode, fingerprint, previous.armModes?.[mode] ?? previous.runtime?.armModes?.[mode])
    receipts.push([key, hash(resultBytes)])
    const origin = { key, directory: dir, resultSHA256: hash(resultBytes), experimentSHA256: fingerprint, concurrency: previous.concurrency, adaptive: Boolean(previous.memoryPolicy?.capacityFile), ...(previous.environment ? { environment: previous.environment } : {}) }
    if (excludeUnproductive && row.status === 'environment-error' && row.functionalSuccess === null && row.agent === undefined && !existsSync(join(dir, 'gateway.jsonl')) && !existsSync(join(dir, 'agent/model.patch'))) { excluded.push({ ...origin, reason: 'free environment preparation only; no model gateway or agent' }); continue }
    completed.set(key, row); origins.set(key, origin)
  }
  if (!completed.size) throw Error('continuation has no bound source receipts')
  const phases = [...new Set([...origins.values()].map(r => r.experimentSHA256))].map(experimentSHA256 => { const rows = [...origins.values()].filter(r => r.experimentSHA256 === experimentSHA256); return { experimentSHA256, concurrency: rows[0].concurrency, adaptive: rows[0].adaptive, attempts: rows.length, ...(rows[0].environment ? { environment: rows[0].environment } : {}) } })
  return { completed, origins, identity: { ...adapter, sourceOut, sourceConfigSHA256: hash(bytes), sourceExperimentSHA256: fingerprint, sourceResultsSHA256: hash(JSON.stringify(receipts)), sourceConcurrency: previous.concurrency, inheritedCount: completed.size, receiptOrigins: [...origins.values()], phases, ...(excludeUnproductive ? { excludeUnproductive: true, excludedUnproductive: excluded } : {}), ...(allowMemoryChange ? { allowMemoryChange: true, memoryChange: { fromBytes: previous.environment.memoryBytes, toBytes: config.environment.memoryBytes, sourceEnvironment: previous.environment, targetEnvironment: config.environment } } : {}) } }
}

export const validateConcurrency = (concurrency, resources, overcommit = false) => {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw Error('concurrency must be 1 through 8')
  if (concurrency > 1 && !(resources.memoryBytes >= 8.5 * 1024 ** 3)) throw Error('parallel jobs require at least 8.5 GiB Docker VM memory')
  if (concurrency > 2) {
    if (!overcommit) throw Error('more than two jobs require explicit memory overcommit')
    if (!(resources.swapBytes >= 512 * 1024 ** 2)) throw Error('memory overcommit requires Docker VM swap')
    if (!(resources.cpus >= concurrency * 1.25)) throw Error('insufficient Docker CPU allocation')
  }
}
