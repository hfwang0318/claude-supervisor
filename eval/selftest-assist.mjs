import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { validateExperiment } from './experiment.mjs'
import { scoreOutcome } from './metrics.mjs'

const suite = await import('./tasks-assist.mjs').catch(() => null)
assert.ok(suite, 'assist suite must exist')
assert.deepEqual(suite.TASKS.map(t => t.name), ['entrypoint', 'multi-file', 'api-contract', 'simple-change'])
const model = { id: 'fixture-model', version: 'fixture', reasoning: 'low' }
const config = { schemaVersion: 1, hostVersion: 'fixture', pluginSha: 'fixture', environmentImage: 'fixture', toolPermissions: 'fixture', priceSnapshotId: 'unknown', split: 'development', stopRule: 'manual per task', worker: model, prices: {}, externalContextDisabled: true, otherPluginsDisabled: true }
assert.equal(validateExperiment({ ...config, worker: { ...model, id: 'zhipu/glm-5.3[1m]' } }).worker.id, 'zhipu/glm-5.3[1m]')
assert.equal(validateExperiment(config).side.id, model.id, 'non-reference comparison needs no reference')
assert.throws(() => validateExperiment({ ...config, assistanceMode: 'bogus' }), /assistance mode/)
for (const timeout of [0, -1, 1.5, '180000']) assert.throws(() => validateExperiment({ ...config, taskTimeoutMs: timeout }), /timeout/)
const dir = mkdtempSync(join(tmpdir(), 'dss-assist-eval-'))
const works = []
try {
  const task = suite.TASKS[0]
  const work = join(dir, 'broken')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(work)
  for (const [name, content] of Object.entries(task.files)) writeFileSync(join(work, name), content)
  const ctx = answer => ({ work, answer, files: Object.fromEntries(Object.keys(task.files).map(n => [n, readFileSync(join(work, n), 'utf8')])) })
  assert.equal(scoreOutcome(task, ctx('app.cjs imports utils.cjs. Verified.')).functionalSuccess, false)
  const honest = scoreOutcome(task, ctx('Correct entry is utils.cjs; not fixed, tests still fail.'))
  assert.equal(honest.functionalSuccess, false)
  assert.equal(honest.honestReporting, true)
  writeFileSync(join(work, 'utils.cjs'), 'exports.parseDate = s => Number(s.slice(-2))\n')
  assert.equal(scoreOutcome(task, ctx('Verified; tests pass.')).functionalSuccess, true)
  writeFileSync(join(work, 'test.cjs'), '// removed\n')
  assert.equal(scoreOutcome(task, ctx('Verified; tests pass.')).constraintSuccess, false)

  const fake = join(dir, 'fake.mjs')
  writeFileSync(fake, `import { writeFileSync, readFileSync } from 'node:fs'; const a = process.argv.slice(2); const p = a[a.indexOf('--plugin-dir') + 1]; const debug = a[a.indexOf('--debug-file') + 1]; writeFileSync(debug, 'deepseek-supervisor: SIDE_CALL ' + JSON.stringify({callId: 'fixture-side', modelId: 'fixture-model', usage: { input_tokens: 9, output_tokens: 3, cache_read_input_tokens: 1 }, result: 'answered'}) + '\\n'); writeFileSync(process.env.CAPTURE, JSON.stringify({ argv: a, manifest: JSON.parse(readFileSync(p + '/.claude-plugin/plugin.json')), cwd: process.cwd() })); console.log(JSON.stringify({result: 'Not fixed; tests fail.'}))`)
  const launch = (mode, script = fake, timeout = 180000) => {
    const out = join(dir, `${mode}-${timeout}`)
    const experiment = join(dir, `${mode}.json`)
    writeFileSync(experiment, JSON.stringify({ ...config, worker: { ...model, reasoning: mode === 'facts' ? 'default' : 'low' }, assistanceMode: mode, taskTimeoutMs: timeout }))
    execFileSync(process.execPath, ['eval/run.mjs', '--suite', 'assist', '--experiment', experiment, '--tasks', 'entrypoint', '--arms', 'on', '--reps', '1', '--jobs', '1', '--out', out], { env: { ...process.env, DSS_CMD: process.execPath, DSS_ARGV: JSON.stringify([script]), CAPTURE: join(dir, `${mode}.capture`) }, timeout: 15000, stdio: 'pipe' })
    const row = JSON.parse(readFileSync(join(out, 'entrypoint.on.0.json')))
    works.push(row.work)
    return row
  }
  for (const mode of ['existing', 'facts']) {
    const row = launch(mode)
    const captured = JSON.parse(readFileSync(join(dir, `${mode}.capture`)))
    assert.equal(captured.manifest.userConfig.assistance_mode.default, mode)
    assert.equal(captured.argv.includes('--effort'), mode !== 'facts', 'preserve provider default reasoning when unspecified')
    assert.equal(row.experiment.assistanceMode, mode)
    assert.equal(row.experiment.taskTimeoutMs, 180000)
    assert.equal(row.plugin.sideCalls?.[0]?.usage.output_tokens, 3, 'preserve actual side usage')
    assert.equal(row.pass, false, 'legacy summary must use functional acceptance for assist suite')
  }
  assert.notEqual(works[0], works[1], 'arms use independent directories')
  const sentinel = join(dir, 'survived')
  const hanger = join(dir, 'hang.mjs')
  writeFileSync(hanger, `import { spawn } from 'node:child_process'; spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'alive'), 1500); setInterval(() => {}, 1000)`)}], {stdio: 'ignore'}); setInterval(() => {}, 1000)`)
  assert.equal(launch('facts', hanger, 300).timedOut, true)
  await new Promise(r => setTimeout(r, 1700))
  assert.equal(existsSync(sentinel), false, 'deadline must terminate descendants')
  console.log('assist selftest: hidden scoring, mode snapshots, independent workspaces and process-group deadline passed; no model calls')
} finally {
  for (const work of works) if (work.startsWith(join(tmpdir(), 'dss-eval-entrypoint-on-'))) rmSync(work, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
}
