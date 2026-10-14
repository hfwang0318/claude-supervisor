import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const incremental = await import('./incremental.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw error
})
const runState = await import('./run-state.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw error
})

const hash = value => createHash('sha256').update(value).digest('hex')
const manifestBytes = JSON.stringify({ tasks: ['a', 'b', 'c'].map(instanceId => ({ instanceId, repo: 'repo' })) })
const baselineBytes = JSON.stringify({ model: 'zhipu/glm-5.2', sideModel: 'zhipu/glm-5.2', complete: true, manifestSHA256: hash(manifestBytes), pairs: [
  { task: 'a', existing: 'passed', facts: 'passed' },
  { task: 'b', existing: 'failed', facts: 'passed' },
  { task: 'c', existing: 'passed', facts: 'environment-error' }
] })
const selection = { schemaVersion: 1, name: 'round-2', manifestSHA256: hash(manifestBytes), baselineSummarySHA256: hash(baselineBytes), arms: ['existing', 'facts'], taskCount: 2, plannedAttempts: 4, skippedBothPassed: 1, tasks: [
  { instanceId: 'b', repo: 'repo', baseline: { existing: 'failed', facts: 'passed' } },
  { instanceId: 'c', repo: 'repo', baseline: { existing: 'passed', facts: 'unknown' } }
] }
const select = (s = selection, m = manifestBytes, b = baselineBytes) => incremental.selectIncremental(m, JSON.stringify(s), b)
assert.equal(typeof incremental.selectIncremental, 'function', 'incremental selection must exist')
const plan = select()
assert.deepEqual(plan.tasks.map(t => t.instanceId), ['b', 'c'])
assert.deepEqual(plan.skipped.map(t => t.instanceId), ['a'])
for (const [candidate, message] of [
  [{ ...selection, manifestSHA256: '0'.repeat(64) }, /manifest/],
  [{ ...selection, baselineSummarySHA256: '0'.repeat(64) }, /baseline/],
  [{ ...selection, tasks: [selection.tasks[0], selection.tasks[0]] }, /duplicate/],
  [{ ...selection, tasks: [selection.tasks[0]] }, /union|count/],
  [{ ...selection, tasks: [...selection.tasks, { instanceId: 'a', repo: 'repo', baseline: { existing: 'passed', facts: 'passed' } }] }, /union|count/],
  [{ ...selection, tasks: [{ ...selection.tasks[0], repo: 'other' }, selection.tasks[1]] }, /repo/],
  [{ ...selection, tasks: [{ ...selection.tasks[0], baseline: { existing: 'passed', facts: 'passed' } }, selection.tasks[1]] }, /outcome/],
  [{ ...selection, plannedAttempts: 60 }, /count/],
  [{ ...selection, arms: ['facts'] }, /arms/]
]) assert.throws(() => select(candidate), message)
assert.throws(() => select(selection, manifestBytes, JSON.stringify({ ...JSON.parse(baselineBytes), complete: false })), /baseline/)
const rows = [
  { task: 'b', mode: 'existing', functionalSuccess: true },
  { task: 'b', mode: 'facts', functionalSuccess: true },
  { task: 'c', mode: 'existing', functionalSuccess: false }
]
const summary = incremental.summarizeIncremental(plan, rows)
assert.equal(summary.planned, 4)
assert.equal(summary.finished, 3)
assert.deepEqual(summary.arms.existing, { passed: 1, failed: 1, unknown: 0, pending: 0, repaired: 1, regressed: 1, stillFailed: 0 })
assert.equal(summary.arms.facts.pending, 1)
assert.deepEqual(summary.remaining.map(t => t.instanceId), ['c'])
assert.equal(summary.skipped[0].status, 'historical-both-passed-not-run')
assert.throws(() => incremental.summarizeIncremental(plan, [...rows, rows[0]]), /duplicate/)
assert.throws(() => incremental.summarizeIncremental(plan, [{ task: 'a', mode: 'facts', functionalSuccess: true }]), /outside/)
assert.throws(() => incremental.summarizeIncremental(plan, [{ task: 'b', mode: 'facts' }]), /outcome/)
const unknown = incremental.summarizeIncremental(plan, [{ task: 'b', mode: 'facts', functionalSuccess: null }])
assert.equal(unknown.arms.facts.unknown, 1)
assert.equal(unknown.arms.facts.regressed, 0)
assert.deepEqual(unknown.remaining.map(t => t.instanceId), ['b', 'c'])
const completed = incremental.summarizeIncremental(plan, [...rows, { task: 'c', mode: 'facts', functionalSuccess: null }])
assert.equal(typeof incremental.nextSelection, 'function', 'completed rounds must produce a bound next selection')
const next = incremental.nextSelection(plan.name, JSON.stringify(completed))
assert.equal(next.taskCount, 1)
assert.equal(next.plannedAttempts, 2)
assert.deepEqual(next.tasks.map(t => t.instanceId), ['c'])
const nextPlan = incremental.selectIncremental(manifestBytes, JSON.stringify(next), JSON.stringify(completed))
assert.deepEqual(nextPlan.skipped.map(t => t.instanceId), ['a', 'b'])
assert.throws(() => incremental.nextSelection(plan.name, JSON.stringify(summary)), /incomplete/)
const allPassed = incremental.summarizeIncremental(plan, ['b', 'c'].flatMap(task => ['existing', 'facts'].map(mode => ({ task, mode, functionalSuccess: true }))))
assert.equal(incremental.nextSelection(plan.name, JSON.stringify(allPassed)).plannedAttempts, 0)

// Exercise the actual runner before any runtime/Docker setup is available.
const dir = mkdtempSync(join(tmpdir(), 'incremental-'))
try {
  const baseline = join(dir, 'baseline.json'), chosen = join(dir, 'selection.json')
  writeFileSync(baseline, baselineBytes)
  writeFileSync(chosen, JSON.stringify(selection))
  const manifest = join(dir, 'manifest.json')
  writeFileSync(manifest, manifestBytes)
  const run = args => spawnSync(process.execPath, [resolve('eval/swe-pro/run.mjs'), '--manifest', manifest, '--selection', chosen, '--baseline-summary', baseline, '--dry-run', ...args], { cwd: dir, encoding: 'utf8' })
  const preview = run([])
  assert.equal(preview.status, 0, preview.stderr)
  const jobs = JSON.parse(preview.stdout).jobs
  assert.equal(jobs.length, 4)
  assert.deepEqual(new Set(jobs.map(j => `${j.task}/${j.mode}`)), new Set(['b/existing', 'b/facts', 'c/existing', 'c/facts']))
  assert.notEqual(run(['--selection-file', chosen]).status, 0, 'unknown flags cannot silently expand the paid scope')
  assert.notEqual(run(['--selection', chosen]).status, 0, 'duplicate selection arguments are ambiguous')
  writeFileSync(chosen, JSON.stringify({ ...selection, manifestSHA256: 'bad' }))
  assert.notEqual(run([]).status, 0)
} finally { rmSync(dir, { recursive: true, force: true }) }
assert.equal(typeof runState.freezeExperiment, 'function', 'resume must validate every receipt before model dispatch')
const stateDir = mkdtempSync(join(tmpdir(), 'incremental-state-'))
try {
  const config = { model: 'glm-5.3', plugin: 'new', timeoutMs: 10 }
  const job = { task: { instanceId: 'case', image: { pinnedReference: 'image' }, baseCommit: 'abc' }, mode: 'facts' }
  const path = join(stateDir, 'case/facts/result.json')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(stateDir, 'case/facts'), { recursive: true })
  writeFileSync(path, JSON.stringify({ task: 'case', mode: 'facts', functionalSuccess: true }))
  assert.throws(() => runState.freezeExperiment(stateDir, config, [job]), /nonempty|unbound/)
  rmSync(join(stateDir, 'case'), { recursive: true, force: true })
  const frozen = runState.freezeExperiment(stateDir, config, [job])
  assert.equal(frozen.completed.size, 0)
  mkdirSync(join(stateDir, 'case/facts'), { recursive: true })
  const receipt = { task: 'case', mode: 'facts', experimentSHA256: frozen.fingerprint, functionalSuccess: true, status: 'passed', modelIdentityVerified: true, agent: { patchAvailable: true }, grade: { status: 'passed', reward: 1, task: 'case', image: 'image', baseCommit: 'abc' } }
  writeFileSync(path, JSON.stringify(receipt))
  assert.equal(runState.freezeExperiment(stateDir, config, [job]).completed.size, 1)
  for (const invalid of [
    { ...receipt, experimentSHA256: 'old' },
    { ...receipt, status: 'environment-error', modelIdentityVerified: false },
    { ...receipt, grade: { ...receipt.grade, image: 'other' } },
    { ...receipt, functionalSuccess: null, status: 'running' },
    { ...receipt, grade: { ...receipt.grade, reward: 0 } }
  ]) {
    writeFileSync(path, JSON.stringify(invalid))
    assert.throws(() => runState.freezeExperiment(stateDir, config, [job]), /receipt/)
  }
  rmSync(path)
  assert.throws(() => runState.freezeExperiment(stateDir, config, [job]), /unfinished/)
  assert.throws(() => runState.freezeExperiment(stateDir, { ...config, plugin: 'other' }, [job]), /changed/)
} finally { rmSync(stateDir, { recursive: true, force: true }) }
console.log('SWE Pro incremental self-tests passed')
