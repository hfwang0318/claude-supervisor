import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { freezeExperiment } from './run-state.mjs'
const api = await import('./continuation.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e })
assert.equal(typeof api.loadContinuation, 'function', 'concurrency cutover must retain bound receipts without rerunning finished jobs')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const code = dirname(fileURLToPath(import.meta.url))
const adapterHash = dir => hash(readdirSync(dir).filter(n => n.endsWith('.mjs')).sort().map(n => `${n}:${hash(readFileSync(join(dir, n)))}`).join('\n'))
const root = mkdtempSync(join(tmpdir(), 'swe-continuation-'))
try {
  const source = join(root, 'old'), out = join(root, 'new')
  mkdirSync(source)
  const oldAdapter = join(root, 'old-adapter'), changedAdapter = join(root, 'changed-adapter')
  cpSync(code, oldAdapter, { recursive: true })
  writeFileSync(join(oldAdapter, 'run.mjs'), '// Previous reviewed scheduling implementation')
  cpSync(code, changedAdapter, { recursive: true })
  writeFileSync(join(changedAdapter, 'agent.mjs'), '// Changed memory limits and sandbox policy')
  const config = { model: 'zhipu/glm-5.3-flash', sideModel: 'zhipu/glm-5.3-flash', runtime: { plugin: 'same' }, concurrency: 2, adapterSHA256: adapterHash(oldAdapter) }
  writeFileSync(join(source, 'experiment.json'), JSON.stringify(config))
  const jobs = ['a', 'b', 'c'].map(instanceId => ({ task: { instanceId }, mode: 'facts' }))
  const row = { task: 'a', mode: 'facts', experimentSHA256: hash(JSON.stringify(config)), functionalSuccess: null, status: 'agent-or-model-error' }
  mkdirSync(join(source, 'a/facts'), { recursive: true })
  writeFileSync(join(source, 'a/facts/result.json'), JSON.stringify(row))
  const next = { ...config, concurrency: 4, adapterSHA256: adapterHash(code), memoryPolicy: { overcommit: true } }
  const adapters = { sourceAdapter: oldAdapter }
  assert.throws(() => api.loadContinuation(source, { ...next, adapterSHA256: adapterHash(changedAdapter) }, jobs, { ...adapters, currentAdapter: changedAdapter }), /execution|adapter/, 'cutovers cannot change agent memory/sandbox or grading policy')
  const continued = api.loadContinuation(source, next, jobs, adapters)
  assert.equal(continued.completed.size, 1)
  assert.deepEqual(continued.completed.get('a/facts'), row, 'unknown receipts must remain unknown')
  const bound = { ...next, continuation: continued.identity }
  const frozen = freezeExperiment(out, bound, jobs, continued)
  assert.equal(frozen.completed.size, 1)
  const started = []
  for (const job of jobs) if (!frozen.completed.has(job.task.instanceId + '/' + job.mode)) started.push(job.task.instanceId)
  assert.deepEqual(started, ['b', 'c'], 'completed model attempts must never be dispatched again')
  assert.equal(freezeExperiment(out, bound, jobs, api.loadContinuation(source, next, jobs, adapters)).completed.size, 1)
  const secondAdapter = join(root, 'second-adapter')
  cpSync(code, secondAdapter, { recursive: true })
  mkdirSync(join(out, 'b/facts'), { recursive: true })
  const free = { task: 'b', mode: 'facts', experimentSHA256: frozen.fingerprint, functionalSuccess: null, status: 'environment-error' }
  writeFileSync(join(out, 'b/facts/result.json'), JSON.stringify(free))
  const later = { ...next, concurrency: 8 }
  const nested = api.loadContinuation(out, later, jobs, { sourceAdapter: secondAdapter })
  assert.equal(nested.completed.size, 2, 'a later phase must retain receipts from every original experiment')
  assert.equal(nested.origins.get('a/facts').directory, join(source, 'a/facts'))
  const excluded = api.loadContinuation(out, later, jobs, { sourceAdapter: secondAdapter, excludeUnproductive: true })
  assert.equal(excluded.completed.size, 1, 'only zero-model free preparations may be excluded explicitly')
  assert.deepEqual(excluded.identity.excludedUnproductive.map(r => r.key), ['b/facts'])
  writeFileSync(join(out, 'b/facts/gateway.jsonl'), '{"type":"message_start","identityOK":true}\n')
  assert.equal(api.loadContinuation(out, later, jobs, { sourceAdapter: secondAdapter, excludeUnproductive: true }).completed.size, 2, 'any gateway evidence prevents treating a terminal unknown as a free attempt')
  rmSync(join(out, 'b/facts/gateway.jsonl'))
  const environment = { dockerVersion: 'fixed', architecture: 'aarch64', cpus: 10, memoryBytes: 9361784832 }
  const resourceSource = join(root, 'resource-source')
  mkdirSync(join(resourceSource, 'a/facts'), { recursive: true })
  const beforeResource = { ...config, environment }
  writeFileSync(join(resourceSource, 'experiment.json'), JSON.stringify(beforeResource))
  const resourceRow = { ...row, experimentSHA256: hash(JSON.stringify(beforeResource)) }
  writeFileSync(join(resourceSource, 'a/facts/result.json'), JSON.stringify(resourceRow))
  const afterResource = { ...next, environment: { ...environment, memoryBytes: 12 * 1024 ** 3 } }
  assert.throws(() => api.loadContinuation(resourceSource, afterResource, jobs, adapters), /configuration/, 'resource change must be explicit')
  const adjusted = api.loadContinuation(resourceSource, afterResource, jobs, { ...adapters, allowMemoryChange: true })
  assert.deepEqual(adjusted.completed.get('a/facts'), resourceRow, 'VM adjustment cannot rerun or rewrite a model receipt')
  assert.equal(adjusted.identity.memoryChange.fromBytes, environment.memoryBytes)
  assert.equal(adjusted.identity.memoryChange.toBytes, afterResource.environment.memoryBytes)
  const memoryOut = join(root, 'memory-out')
  const memoryFrozen = freezeExperiment(memoryOut, { ...afterResource, continuation: adjusted.identity }, jobs, adjusted)
  mkdirSync(join(memoryOut, 'c/facts'), { recursive: true })
  writeFileSync(join(memoryOut, 'c/facts/result.json'), JSON.stringify({ ...row, task: 'c', experimentSHA256: memoryFrozen.fingerprint }))
  const memoryLater = api.loadContinuation(memoryOut, afterResource, jobs, { sourceAdapter: code })
  assert.equal(memoryLater.completed.size, 2, 'later continuations must revalidate a previously authorized memory transition')
  assert.deepEqual(memoryLater.completed.get('a/facts'), resourceRow)
  assert.deepEqual(memoryLater.identity.phases.map(p => p.environment?.memoryBytes).sort((a, b) => a - b), [environment.memoryBytes, afterResource.environment.memoryBytes], 'historical memory environments must survive later continuations')
  assert.throws(() => api.loadContinuation(resourceSource, { ...afterResource, environment: { ...afterResource.environment, cpus: 8 } }, jobs, { ...adapters, allowMemoryChange: true }), /configuration/, 'memory authorization does not permit CPU/platform drift')
  assert.throws(() => api.loadContinuation(resourceSource, { ...afterResource, model: 'stronger' }, jobs, { ...adapters, allowMemoryChange: true }), /configuration/)
  assert.throws(() => api.loadContinuation(source, { ...next, sideModel: 'stronger' }, jobs, adapters), /configuration/)
  assert.throws(() => api.loadContinuation(source, { ...next, runtime: { plugin: 'changed' } }, jobs, adapters), /configuration/)
  writeFileSync(join(source, 'a/facts/result.json'), JSON.stringify({ ...row, status: 'environment-error' }))
  const changed = api.loadContinuation(source, next, jobs, adapters)
  assert.throws(() => freezeExperiment(out, { ...next, continuation: changed.identity }, jobs, changed), /changed/)
  writeFileSync(join(source, 'a/facts/result.json'), JSON.stringify({ ...row, experimentSHA256: 'unbound' }))
  assert.throws(() => api.loadContinuation(source, next, jobs, adapters), /receipt/)
  writeFileSync(join(source, 'a/facts/result.json'), JSON.stringify(row))
  mkdirSync(join(source, 'b/facts'), { recursive: true })
  assert.throws(() => api.loadContinuation(source, next, jobs, adapters), /unfinished/)
  assert.equal(readFileSync(join(source, 'a/facts/result.json'), 'utf8'), JSON.stringify(row), 'source receipts must not be rewritten')
  rmSync(join(source, 'b'), { recursive: true, force: true })
  const manifestPath = join(root, 'manifest.json')
  const manifest = JSON.stringify({ tasks: jobs.map(j => ({ ...j.task, repo: 'repo' })) })
  writeFileSync(manifestPath, manifest)
  const cliConfig = { ...config, manifestSHA256: hash(manifest) }
  writeFileSync(join(source, 'experiment.json'), JSON.stringify(cliConfig))
  writeFileSync(join(source, 'a/facts/result.json'), JSON.stringify({ ...row, experimentSHA256: hash(JSON.stringify(cliConfig)) }))
  const preview = spawnSync(process.execPath, [join(code, 'run.mjs'), '--manifest', manifestPath, '--continue-from', source, '--continue-adapter', oldAdapter, '--out', join(root, 'preview'), '--jobs', '4', '--allow-memory-overcommit', '--dry-run'], { cwd: root, encoding: 'utf8' })
  assert.equal(preview.status, 0, preview.stderr)
  assert.equal(JSON.parse(preview.stdout).planned, 5)
  assert.equal(JSON.parse(preview.stdout).inherited, 1)
} finally { rmSync(root, { recursive: true, force: true }) }
assert.equal(typeof api.validateConcurrency, 'function')
const resources = { memoryBytes: 9361784832, swapBytes: 1073741824, cpus: 10 }
assert.doesNotThrow(() => api.validateConcurrency(4, resources, true))
assert.throws(() => api.validateConcurrency(4, resources, false), /overcommit/)
assert.throws(() => api.validateConcurrency(4, { ...resources, swapBytes: 0 }, true), /swap/)
assert.throws(() => api.validateConcurrency(4, { ...resources, memoryBytes: 4 * 1024 ** 3 }, true), /memory/)
assert.throws(() => api.validateConcurrency(4, { ...resources, cpus: 2 }, true), /CPU/)
assert.doesNotThrow(() => api.validateConcurrency(8, resources, true))
for (const invalid of [0, 9, 1.5, NaN]) assert.throws(() => api.validateConcurrency(invalid, resources, true), /concurrency/)
console.log('SWE Pro continuation/concurrency self-tests passed')
