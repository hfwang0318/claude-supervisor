import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { MODEL } from './gateway.mjs'
import { openModelNetwork, runAgent, treeHash } from './agent.mjs'
import { grade, readyPair, verifyArtifacts, command, prepareTask } from './docker.mjs'
import { schedule, validateResume, identityValid, summarizeUsage, boundedMap } from './schedule.mjs'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
const manifestPath = resolve('eval/data/swe-pro-v2/subset-v1.json')
const manifest = JSON.parse(readFileSync(manifestPath))
const tasksRoot = resolve(arg('tasks-root', '.superpowers/sdd/2026-10-13-local-swe-pro-glm53/tasks'))
const runtime = resolve(arg('runtime', '.superpowers/sdd/2026-10-13-local-swe-pro-glm53/runtime'))
const readiness = resolve(arg('readiness', 'eval/results/swe-pro-glm53/readiness'))
const out = resolve(arg('out', 'eval/results/swe-pro-glm53/comparison'))
const identity = JSON.parse(readFileSync(join(runtime, 'identity.json')))
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
for (const mode of ['existing', 'facts']) if (treeHash(join(runtime, `plugin-${mode}`)) !== identity.pluginHashes[mode]) throw Error('frozen plugin changed')
if (hash(join(runtime, 'gateway.mjs')) !== identity.gatewaySHA256 || hash(join(runtime, 'node')) !== identity.nodeSHA256 || hash(join(runtime, 'claude')) !== identity.claudeSHA256) throw Error('frozen runtime changed')
const concurrency = Number(arg('jobs', '2'))
if (![1, 2].includes(concurrency)) throw Error('concurrency must be 1 or 2')
const infoResult = await command(['info', '--format', '{{json .}}'])
if (infoResult.exitCode !== 0) throw Error('Docker daemon unavailable')
const info = JSON.parse(infoResult.stdout)
if (concurrency === 2 && info.MemTotal < 8.5 * 1024 ** 3) throw Error('two jobs require at least 8.5 GiB Docker VM memory')
const environment = { dockerVersion: info.ServerVersion, architecture: info.Architecture, cpus: info.NCPU, memoryBytes: info.MemTotal }
const config = { schemaVersion: 1, manifestSHA256: hash(manifestPath), runtime: identity, environment, preparationPolicy: 'per-task-calibration-in-worker-slots', model: MODEL, sideModel: MODEL, reasoning: 'default', seed: 53, repetitions: 1, arms: ['existing', 'facts'], timeoutMs: 3_000_000, concurrency, costUSD: 'unknown', adapterSHA256: createHash('sha256').update(readdirSync(resolve('eval/swe-pro')).filter(n => n.endsWith('.mjs')).sort().map(n => `${n}:${hash(resolve('eval/swe-pro', n))}`).join('\n')).digest('hex') }
mkdirSync(out, { recursive: true })
const configPath = join(out, 'experiment.json')
if (existsSync(configPath)) validateResume(JSON.parse(readFileSync(configPath)), config)
else writeFileSync(configPath, JSON.stringify(config, null, 2))
const jobs = schedule(manifest.tasks, config.seed)
writeFileSync(join(out, 'schedule.json'), JSON.stringify(jobs.map(j => ({ task: j.task.instanceId, mode: j.mode })), null, 2))
let interrupted = false
const controller = new AbortController()
const interrupt = () => { interrupted = true; controller.abort() }
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
const results = []
const preparations = new Map()
const persistResults = () => writeFileSync(join(out, 'results.json'), JSON.stringify(results.filter(Boolean), null, 2))
await boundedMap(jobs, concurrency, async ({ task, mode }, index) => {
  const dir = join(out, task.instanceId, mode), resultPath = join(dir, 'result.json')
  if (existsSync(resultPath)) { results[index] = JSON.parse(readFileSync(resultPath)); return }
  if (existsSync(dir)) throw Error(`unfinished attempt retained: ${task.instanceId}/${mode}; review it before restarting`)
  mkdirSync(dir, { recursive: true })
  const result = { task: task.instanceId, repo: task.repo, split: task.split, mode, costUSD: 'unknown', status: 'environment-error', functionalSuccess: null }
  if (!preparations.has(task.instanceId)) preparations.set(task.instanceId, prepareTask(task, tasksRoot, join(readiness, task.instanceId), { signal: controller.signal, progress: phase => console.log(new Date().toISOString(), task.repo, 'environment', phase) }))
  const ready = await preparations.get(task.instanceId)
  if (!ready || ready.task !== task.instanceId || ready.image !== task.image.pinnedReference || !readyPair(ready.empty, ready.reference)) result.error = 'empty/reference readiness not satisfied'
  else {
    verifyArtifacts(task, tasksRoot)
    console.log(new Date().toISOString(), task.repo, mode, 'starting')
    const auditPath = join(dir, 'gateway.jsonl')
    let network
    try {
      network = await openModelNetwork(runtime, auditPath)
      const { receipt, patch } = await runAgent(task, readFileSync(join(tasksRoot, task.instanceId, 'instruction.md'), 'utf8'), mode, runtime, network.network, dir, { timeoutMs: config.timeoutMs, signal: controller.signal })
      await network.close(); network = undefined
      result.agent = receipt
      const events = existsSync(auditPath) ? readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
      result.modelIdentityVerified = identityValid(events)
      result.usage = summarizeUsage(events)
      result.modelRequests = events.filter(e => e.type === 'request' && e.maxOutput !== undefined).length
      const debug = existsSync(join(dir, 'agent/debug.log')) ? readFileSync(join(dir, 'agent/debug.log'), 'utf8') : ''
      result.sideCalls = [...debug.matchAll(/SIDE_CALL\s+(\{[^\n]+\})/g)].flatMap(m => { try { return [JSON.parse(m[1])] } catch { return [] } })
      result.factsReturned = (debug.match(/"delivery":"context-returned"/g) ?? []).length
      if (result.modelIdentityVerified && receipt.patchAvailable && ['completed', 'timeout', 'agent-error'].includes(receipt.status)) {
        result.grade = await grade(task, tasksRoot, patch, join(dir, 'grade'), { signal: controller.signal, calibrated: true })
        result.status = result.grade.status
        result.functionalSuccess = result.grade.reward === null ? null : result.grade.reward === 1
      } else { result.status = 'agent-or-model-error'; result.error = 'model identity or patch capture not valid' }
    } catch (error) { result.error = error.message }
    finally { if (network) await network.close() }
  }
  writeFileSync(resultPath, JSON.stringify(result, null, 2))
  results[index] = result
  persistResults()
  console.log(new Date().toISOString(), task.repo, mode, result.status, results.filter(Boolean).length + '/' + jobs.length)
}, { signal: controller.signal, onError: interrupt })
persistResults()
console.log(JSON.stringify({ finished: results.filter(Boolean).length, planned: jobs.length, interrupted, arms: Object.fromEntries(['existing', 'facts'].map(mode => { const rows = results.filter(r => r?.mode === mode); return [mode, { passed: rows.filter(r => r.functionalSuccess === true).length, failed: rows.filter(r => r.functionalSuccess === false).length, unknown: rows.filter(r => r.functionalSuccess === null).length }] })) }, null, 2))
