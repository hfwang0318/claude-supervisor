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
  const scheduling = new Set(['run.mjs', 'run-state.mjs', 'continuation.mjs', 'continuation-selftest.mjs', 'schedule-selftest.mjs'])
  const unchanged = [...new Set([...adapterFiles(source), ...adapterFiles(target)])].filter(n => !scheduling.has(n)).sort()
  for (const name of unchanged) {
    if (!existsSync(join(source, name)) || !existsSync(join(target, name)) || hash(readFileSync(join(source, name))) !== hash(readFileSync(join(target, name)))) throw Error(`continuation execution adapter changed: ${name}`)
  }
  return { sourceAdapterOut: source, executionAdapterSHA256: hash(unchanged.map(n => `${n}:${hash(readFileSync(join(target, n)))}`).join('\n')) }
}
const stableConfiguration = config => {
  const stable = { ...config }
  for (const field of ['concurrency', 'adapterSHA256', 'memoryPolicy', 'continuation']) delete stable[field]
  return stable
}

// An explicit new phase may change scheduling, never the model, plugin, task
// material, per-task budgets or physical environment. Original receipts stay
// in their source directory and retain their original experiment fingerprint.
export const loadContinuation = (source, config, jobs, { sourceAdapter, currentAdapter = code } = {}) => {
  const sourceOut = resolve(source), bytes = readFileSync(join(sourceOut, 'experiment.json'))
  const previous = JSON.parse(bytes)
  if (previous.continuation || previous.incremental || config.incremental) throw Error('continuation requires a first-phase full baseline')
  if (JSON.stringify(stableConfiguration(previous)) !== JSON.stringify(stableConfiguration(config))) throw Error('continuation configuration changed beyond scheduling')
  const adapter = verifyExecutionAdapter(previous.adapterSHA256, config.adapterSHA256, sourceAdapter, currentAdapter)
  const fingerprint = hash(JSON.stringify(previous)), completed = new Map(), receipts = []
  for (const { task, mode } of jobs) {
    const key = `${task.instanceId}/${mode}`, dir = join(sourceOut, key), path = join(dir, 'result.json')
    if (!existsSync(path)) {
      if (existsSync(dir)) throw Error(`unfinished source attempt: ${key}; stop and preserve it first`)
      continue
    }
    const resultBytes = readFileSync(path), row = JSON.parse(resultBytes)
    validateResult(row, task, mode, fingerprint)
    completed.set(key, row)
    receipts.push([key, hash(resultBytes)])
  }
  if (!completed.size) throw Error('continuation has no bound source receipts')
  return { completed, identity: { ...adapter, sourceOut, sourceConfigSHA256: hash(bytes), sourceExperimentSHA256: fingerprint, sourceResultsSHA256: hash(JSON.stringify(receipts)), sourceConcurrency: previous.concurrency, inheritedCount: completed.size } }
}

export const validateConcurrency = (concurrency, resources, overcommit = false) => {
  if (![1, 2, 3, 4].includes(concurrency)) throw Error('concurrency must be 1 through 4')
  if (concurrency > 1 && !(resources.memoryBytes >= 8.5 * 1024 ** 3)) throw Error('parallel jobs require at least 8.5 GiB Docker VM memory')
  if (concurrency > 2) {
    if (!overcommit) throw Error('three/four jobs require explicit memory overcommit')
    if (!(resources.swapBytes >= 512 * 1024 ** 2)) throw Error('memory overcommit requires Docker VM swap')
    if (!(resources.cpus >= concurrency * 1.25)) throw Error('insufficient Docker CPU allocation')
  }
}
