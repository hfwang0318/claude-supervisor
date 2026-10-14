import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { MODEL, MODEL_POLICY, assertEvaluationModel } from './gateway.mjs'
import { openModelNetwork, runAgent, treeHash, NODE_IMAGE } from './agent.mjs'
import { grade, readyForTask, verifyArtifacts, command, prepareTask } from './docker.mjs'
import { schedule, identityValid, summarizeUsage, boundedMap } from './schedule.mjs'
import { nextSelection } from './incremental.mjs'
import { selectRegression, summarizeBaseline, baselineSelections, summarizeRegression } from './regression.mjs'
import { freezeExperiment, validateResult } from './run-state.mjs'
import { loadContinuation, validateConcurrency, adapterFingerprint } from './continuation.mjs'
import { fileURLToPath } from 'node:url'
import { adaptiveMap, admissionPolicy, registerDrainSignals } from './capacity.mjs'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
const valueFlags = ['manifest', 'selection', 'baseline-summary', 'tasks-root', 'runtime', 'readiness', 'out', 'jobs', 'continue-from', 'continue-adapter', 'capacity-file']
const seenFlags = new Set()
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i]
  if (seenFlags.has(flag)) throw Error(`duplicate argument: ${flag}`)
  seenFlags.add(flag)
  if (['--dry-run', '--allow-memory-overcommit', '--exclude-unproductive', '--allow-vm-memory-change'].includes(flag)) continue
  if (!valueFlags.some(name => flag === `--${name}`)) throw Error(`unknown argument: ${flag}`)
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error(`missing value: ${flag}`)
  i++
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const manifestPath = resolve(arg('manifest', 'eval/data/swe-pro-v2/subset-v1.json'))
const manifestBytes = readFileSync(manifestPath), manifest = JSON.parse(manifestBytes)
const selectionPath = arg('selection', null), baselinePath = arg('baseline-summary', null)
const continuationPath = arg('continue-from', null)
const continuationAdapter = arg('continue-adapter', null)
const excludeUnproductive = process.argv.includes('--exclude-unproductive')
const allowMemoryChange = process.argv.includes('--allow-vm-memory-change')
if (allowMemoryChange && !continuationPath) throw Error('VM memory change requires an explicit continuation')
if (excludeUnproductive && !continuationPath) throw Error('unproductive exclusions require an explicit continuation')
if (!!continuationPath !== !!continuationAdapter) throw Error('--continue-from and --continue-adapter must be provided together')
if (continuationPath && (selectionPath || !arg('out', null))) throw Error('continuation requires a full baseline and a new explicit --out')
if (!!selectionPath !== !!baselinePath) throw Error('--selection and --baseline-summary must be provided together')
const models = { model: MODEL, sideModel: MODEL }
const incremental = selectionPath ? selectRegression(manifestBytes, readFileSync(resolve(selectionPath)), readFileSync(resolve(baselinePath)), models) : null
if (!incremental) summarizeBaseline(manifestBytes, [], models)
const jobs = schedule(incremental?.tasks ?? manifest.tasks, 53)
if (process.argv.includes('--dry-run')) {
  const preview = continuationPath ? loadContinuation(continuationPath, { ...JSON.parse(readFileSync(join(resolve(continuationPath), 'experiment.json'))), ...models, manifestSHA256: hash(manifestPath), adapterSHA256: adapterFingerprint(dirname(fileURLToPath(import.meta.url))) }, jobs, { sourceAdapter: continuationAdapter, excludeUnproductive, allowMemoryChange }) : undefined
  const remaining = jobs.filter(j => !preview?.completed.has(`${j.task.instanceId}/${j.mode}`))
  console.log(JSON.stringify({ manifestSHA256: hash(manifestPath), selection: incremental ? { name: incremental.name, selectionSHA256: incremental.selectionSHA256, baselineSummarySHA256: incremental.baselineSummarySHA256 } : null, planned: remaining.length, ...(preview ? { cohortPlanned: jobs.length, inherited: preview.completed.size } : {}), jobs: remaining.map(j => ({ task: j.task.instanceId, mode: j.mode })), skipped: incremental?.skipped ?? [] }, null, 2))
  process.exit(0)
}
if (jobs.length === 0) throw Error('no remaining tasks; no model execution needed')
assertEvaluationModel(MODEL)
const tasksRoot = resolve(arg('tasks-root', '.superpowers/sdd/2026-10-13-local-swe-pro-glm53/tasks'))
const runtime = resolve(arg('runtime', 'eval/results/swe-pro-glm53-flash/runtime'))
const readiness = resolve(arg('readiness', 'eval/results/swe-pro-glm53-flash/readiness'))
if (incremental && !arg('out', null)) throw Error('incremental execution requires a new explicit --out directory')
const out = resolve(arg('out', 'eval/results/swe-pro-glm53-flash/baseline'))
const identity = JSON.parse(readFileSync(join(runtime, 'identity.json')))
if (identity.model !== MODEL || identity.sideModel !== MODEL) throw Error('frozen runtime model identities differ from current main/side models')
for (const mode of ['existing', 'facts']) if (treeHash(join(runtime, `plugin-${mode}`)) !== identity.pluginHashes[mode]) throw Error('frozen plugin changed')
if (hash(join(runtime, 'gateway.mjs')) !== identity.gatewaySHA256 || hash(join(runtime, 'node')) !== identity.nodeSHA256 || hash(join(runtime, 'claude')) !== identity.claudeSHA256) throw Error('frozen runtime changed')
const concurrency = Number(arg('jobs', '2'))
const capacityFile = arg('capacity-file', null) ? resolve(arg('capacity-file')) : undefined
if (concurrency > 4 && !capacityFile) throw Error('more than four jobs require a live capacity lease file')
if (capacityFile && !existsSync(capacityFile)) throw Error('capacity lease file is missing')
const infoResult = await command(['info', '--format', '{{json .}}'])
if (infoResult.exitCode !== 0) throw Error('Docker daemon unavailable')
const info = JSON.parse(infoResult.stdout)
const overcommit = process.argv.includes('--allow-memory-overcommit')
let swapBytes = 0
if (concurrency > 2) {
  const memory = await command(['run', '--rm', '--network', 'none', '--memory', '64m', '--cpus', '0.25', NODE_IMAGE, 'cat', '/proc/meminfo'])
  if (memory.exitCode !== 0) throw Error('Docker VM swap probe failed')
  swapBytes = Number(memory.stdout.match(/^SwapTotal:\s+(\d+) kB$/m)?.[1]) * 1024
}
validateConcurrency(concurrency, { memoryBytes: info.MemTotal, swapBytes, cpus: info.NCPU }, overcommit)
const environment = { dockerVersion: info.ServerVersion, architecture: info.Architecture, cpus: info.NCPU, memoryBytes: info.MemTotal }
const config = { schemaVersion: 1, manifestSHA256: hash(manifestPath), runtime: identity, environment, preparationPolicy: 'per-task-calibration-in-worker-slots', model: MODEL, sideModel: MODEL, modelPolicy: MODEL_POLICY, reasoning: 'default', seed: 53, repetitions: 1, arms: ['existing', 'facts'], timeoutMs: 3_000_000, concurrency, costUSD: 'unknown', adapterSHA256: createHash('sha256').update(readdirSync(resolve('eval/swe-pro')).filter(n => n.endsWith('.mjs')).sort().map(n => `${n}:${hash(resolve('eval/swe-pro', n))}`).join('\n')).digest('hex') }
if (incremental) config.incremental = { kind: incremental.kind, name: incremental.name, selectionSHA256: incremental.selectionSHA256, baselineSummarySHA256: incremental.baselineSummarySHA256, tasks: incremental.tasks.map(t => t.instanceId), skipped: incremental.skipped }
if (concurrency > 2 || capacityFile) config.memoryPolicy = admissionPolicy({ concurrency, overcommit, swapBytes, capacityFile })
const continuation = continuationPath ? loadContinuation(continuationPath, config, jobs, { sourceAdapter: continuationAdapter, excludeUnproductive, allowMemoryChange }) : undefined
if (continuation) config.continuation = continuation.identity
const frozen = freezeExperiment(out, config, jobs, continuation)
writeFileSync(join(out, 'schedule.json'), JSON.stringify(jobs.map(j => ({ task: j.task.instanceId, mode: j.mode })), null, 2))
let interrupted = false
const controller = new AbortController()
const dispatchController = new AbortController()
const interrupt = registerDrainSignals(controller, dispatchController, () => { interrupted = true })
const results = jobs.map(({ task, mode }) => frozen.completed.get(`${task.instanceId}/${mode}`))
const preparations = new Map()
const persistResults = () => {
  const rows = results.filter(Boolean)
  // Validate before replacing aggregate files, including resumed result receipts.
  const summaryIdentity = { ...models, experimentSHA256: frozen.fingerprint, ...(continuation ? { executionPhases: [...continuation.identity.phases, { experimentSHA256: frozen.fingerprint, concurrency, adaptive: Boolean(capacityFile), environment, attempts: rows.length - continuation.identity.inheritedCount }], ...(allowMemoryChange ? { memoryChange: continuation.identity.memoryChange } : {}), latencyInterpretation: 'Scheduling or VM memory changed between phases; report latency by phase, not as one uniform configuration.' } : {}) }
  const summary = incremental ? summarizeRegression(incremental, rows, summaryIdentity) : summarizeBaseline(manifestBytes, rows, summaryIdentity)
  writeFileSync(join(out, 'results.json'), JSON.stringify(rows, null, 2))
  if (summary) {
    const summaryBytes = JSON.stringify(summary, null, 2)
    writeFileSync(join(out, `summary-${summary.kind}.json`), summaryBytes)
    if (summary.complete && summary.kind === 'incremental') writeFileSync(join(out, 'next-selection.json'), JSON.stringify(nextSelection(incremental.name, summaryBytes), null, 2))
    if (summary.complete && summary.kind === 'baseline') {
      const selections = baselineSelections('glm53-flash-baseline', summaryBytes)
      writeFileSync(join(out, 'failure-selection.json'), JSON.stringify(selections.incremental, null, 2))
      writeFileSync(join(out, 'quick-selection.json'), JSON.stringify(selections.quick, null, 2))
      if (!selections.quick) console.log('Quick selection unavailable: baseline has no double pass or double failure; no substituted task.')
    }
  }
}
persistResults()
const runTask = async ({ task, mode }, index, execution) => {
  const dir = join(out, task.instanceId, mode), resultPath = join(dir, 'result.json')
  if (results[index]) return
  if (existsSync(dir)) throw Error(`unfinished attempt retained: ${task.instanceId}/${mode}; review it before restarting`)
  mkdirSync(dir, { recursive: true })
  const result = { task: task.instanceId, repo: task.repo, split: task.split, mode, experimentSHA256: frozen.fingerprint, costUSD: 'unknown', status: 'environment-error', functionalSuccess: null }
  if (execution) result.execution = execution
  if (!preparations.has(task.instanceId)) preparations.set(task.instanceId, prepareTask(task, tasksRoot, join(readiness, task.instanceId), { signal: controller.signal, progress: phase => console.log(new Date().toISOString(), task.repo, 'environment', phase) }))
  const ready = await preparations.get(task.instanceId)
  if (!readyForTask(task, ready)) result.error = 'empty/reference readiness not satisfied'
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
  validateResult(result, task, mode, frozen.fingerprint)
  writeFileSync(resultPath, JSON.stringify(result, null, 2))
  results[index] = result
  persistResults()
  console.log(new Date().toISOString(), task.repo, mode, result.status, results.filter(Boolean).length + '/' + jobs.length)
}
if (capacityFile) {
  const pending = jobs.map((job, index) => ({ ...job, index })).filter(job => !results[job.index])
  await adaptiveMap(pending, concurrency, (job, index, execution) => runTask(job, job.index, execution), { capacityFile, signal: dispatchController.signal, onError: interrupt })
} else await boundedMap(jobs, concurrency, runTask, { signal: dispatchController.signal, onError: interrupt })
persistResults()
console.log(JSON.stringify({ finished: results.filter(Boolean).length, planned: jobs.length, interrupted, arms: Object.fromEntries(['existing', 'facts'].map(mode => { const rows = results.filter(r => r?.mode === mode); return [mode, { passed: rows.filter(r => r.functionalSuccess === true).length, failed: rows.filter(r => r.functionalSuccess === false).length, unknown: rows.filter(r => r.functionalSuccess === null).length }] })) }, null, 2))
