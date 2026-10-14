import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const api = await import('./regression.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw error
})
assert.equal(typeof api.summarizeBaseline, 'function', 'full runs must produce a bound baseline')
const manifest = JSON.stringify({ tasks: ['a', 'b', 'c', 'd', 'e'].map(instanceId => ({ instanceId, repo: 'repo' })) })
const identity = { model: 'zhipu/glm-5.2', sideModel: 'zhipu/glm-5.2', experimentSHA256: 'frozen' }
const values = [[true, true], [false, false], [true, false], [null, null], [true, true]]
const rows = values.flatMap((v, i) => ['existing', 'facts'].map((mode, j) => ({ task: 'abcde'[i], mode, functionalSuccess: v[j] })))
const baseline = api.summarizeBaseline(manifest, rows, identity)
assert.equal(baseline.complete, true)
assert.equal(baseline.planned, 10)
assert.equal(baseline.model, 'zhipu/glm-5.2')
assert.deepEqual(baseline.remaining.map(t => t.instanceId), ['b', 'c', 'd'])
assert.equal(api.summarizeBaseline(manifest, rows.slice(0, -1), identity).complete, false)
assert.throws(() => api.summarizeBaseline(manifest, [...rows, rows[0]], identity), /duplicate/)
assert.throws(() => api.summarizeBaseline(manifest, [{ task: 'outside', mode: 'facts', functionalSuccess: true }], identity), /outside/)
const bytes = JSON.stringify(baseline)
const selections = api.baselineSelections('glm52', bytes)
assert.deepEqual(selections.incremental.tasks.map(t => t.instanceId), ['b', 'c', 'd'])
assert.equal(selections.quick.kind, 'quick')
assert.equal(selections.quick.plannedAttempts, 4)
assert.deepEqual(selections.quick.tasks.map(t => t.instanceId), ['a', 'b'])
const quick = api.selectRegression(manifest, JSON.stringify(selections.quick), bytes, identity)
assert.equal(quick.kind, 'quick')
assert.deepEqual(quick.tasks.map(t => t.instanceId), ['a', 'b'])
const summary = api.summarizeRegression(quick, rows.filter(r => ['a', 'b'].includes(r.task)), identity)
assert.equal(summary.kind, 'quick')
assert.equal(summary.complete, true)
assert.equal(summary.remaining, undefined, 'quick runs must not retire other tasks')
assert.throws(() => api.selectRegression(manifest, JSON.stringify({ ...selections.quick, tasks: [selections.quick.tasks[0]] }), bytes, identity), /quick|count/)
assert.throws(() => api.selectRegression(manifest, JSON.stringify(selections.quick), bytes, { ...identity, model: 'zhipu/glm-5.3' }), /model/)
assert.throws(() => api.selectRegression(manifest, JSON.stringify(selections.incremental), bytes, { ...identity, sideModel: 'zhipu/glm-5.3' }), /model/)
assert.throws(() => api.selectRegression(manifest, JSON.stringify({ ...selections.quick, kind: 'invalid' }), bytes, identity), /kind/)
assert.throws(() => api.baselineSelections('incomplete', JSON.stringify({ ...baseline, complete: false })), /incomplete/)
const noBothFailed = api.summarizeBaseline(manifest, rows.map(r => ({ ...r, functionalSuccess: r.task === 'b' ? true : r.functionalSuccess })), identity)
assert.equal(api.baselineSelections('none', JSON.stringify(noBothFailed)).quick, null, 'unknowns cannot substitute for double failures')
const dir = mkdtempSync(join(tmpdir(), 'glm52-regression-'))
try {
  const manifestPath = join(dir, 'manifest.json'), baselinePath = join(dir, 'baseline.json'), selectionPath = join(dir, 'quick.json')
  writeFileSync(manifestPath, manifest)
  writeFileSync(baselinePath, bytes)
  writeFileSync(selectionPath, JSON.stringify(selections.quick))
  const run = () => spawnSync(process.execPath, [resolve('eval/swe-pro/run.mjs'), '--manifest', manifestPath, '--selection', selectionPath, '--baseline-summary', baselinePath, '--dry-run'], { cwd: dir, encoding: 'utf8' })
  const preview = run()
  assert.equal(preview.status, 0, preview.stderr)
  assert.equal(JSON.parse(preview.stdout).planned, 4)
  const old = JSON.stringify({ ...baseline, model: 'zhipu/glm-5.3', sideModel: 'zhipu/glm-5.3' })
  writeFileSync(baselinePath, old)
  writeFileSync(selectionPath, JSON.stringify({ ...selections.quick, baselineSummarySHA256: createHash('sha256').update(old).digest('hex') }))
  assert.notEqual(run().status, 0, 'cross-model baselines must be rejected before model dispatch')
  writeFileSync(manifestPath, JSON.stringify({ tasks: [{ instanceId: 'a', repo: 'repo' }, { instanceId: 'a', repo: 'repo' }] }))
  const duplicate = spawnSync(process.execPath, [resolve('eval/swe-pro/run.mjs'), '--manifest', manifestPath, '--dry-run'], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(duplicate.status, 0, 'full baseline duplicates must be rejected before scheduling paid attempts')
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log('SWE Pro baseline/quick regression self-tests passed')
