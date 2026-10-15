import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { freezeRuntime, assertRuntimeModes } from './swe-pro/agent.mjs'
import { validateResult } from './swe-pro/run-state.mjs'
import { reviewMetrics } from './swe-pro/review-metrics.mjs'
import { validateExperiment } from './experiment.mjs'
const dir = mkdtempSync(join(tmpdir(), 'dss-review-eval-'))
try {
  const runtime = join(dir, 'runtime'); mkdirSync(runtime)
  writeFileSync(join(runtime, 'claude'), 'fixture binary, never executed')
  writeFileSync(join(runtime, 'node'), 'fixture node, never executed')
  const checksum = createHash('sha256').update(readFileSync(join(runtime, 'claude'))).digest('hex')
  writeFileSync(join(runtime, 'manifest.json'), JSON.stringify({ version: '2.1.295', platforms: { 'linux-x64': { checksum } } }))
  const identity = freezeRuntime(resolve('.'), runtime, { experimentalMode: 'supervise' })
  assert.deepEqual(identity.armModes, { existing: 'existing', facts: 'supervise' })
  assert.equal(JSON.parse(readFileSync(join(runtime, 'plugin-facts/.claude-plugin/plugin.json'))).userConfig.assistance_mode.default, 'supervise')
  assertRuntimeModes(runtime, identity, 'supervise')
  assert.throws(() => assertRuntimeModes(runtime, identity, 'facts'), /mode/)
  const file = join(runtime, 'plugin-facts/.claude-plugin/plugin.json'), plugin = JSON.parse(readFileSync(file))
  plugin.userConfig.assistance_mode.default = 'facts'; writeFileSync(file, JSON.stringify(plugin))
  assert.throws(() => assertRuntimeModes(runtime, identity, 'supervise'), /mode/)
  const task = { instanceId: 'a' }, row = { task: 'a', mode: 'facts', experimentSHA256: 'hash', status: 'environment-error', functionalSuccess: null }
  assert.throws(() => validateResult(row, task, 'facts', 'hash', 'supervise'), /mode/)
  validateResult({ ...row, assistanceMode: 'supervise' }, task, 'facts', 'hash', 'supervise')
  assert.throws(() => validateResult({ ...row, assistanceMode: 'supervise', agent: { assistanceMode: 'facts' } }, task, 'facts', 'hash', 'supervise'), /mode/)
  const preview = spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--experimental-mode', 'supervise', '--dry-run'], { encoding: 'utf8' })
  assert.equal(preview.status, 0, preview.stderr)
  const jobs = JSON.parse(preview.stdout).jobs
  assert.ok(jobs.some(j => j.mode === 'facts' && j.assistanceMode === 'supervise'))
  assert.ok(jobs.every(j => j.assistanceMode === (j.mode === 'facts' ? 'supervise' : 'existing')))
  const invalid = spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--experimental-mode', 'bogus', '--dry-run'], { encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
  const dims = ['requirement-plan', 'plan-implementation', 'architecture', 'direction', 'exploration', 'verification', 'recovery']
  const log = dims.map(d => `deepseek-supervisor: REVIEW ${JSON.stringify({ phase: 'completion', mode: 'supervise', reviewed: [d], unreviewed: dims.filter(x => x !== d), dimension: d, recommendation: 'adjust', action: 'none', reason: 'prepared' })}`).join('\n')
  const metrics = reviewMetrics(log)
  assert.deepEqual(Object.keys(metrics.dimensions).sort(), dims.sort())
  assert.equal(metrics.reviews.length, 7)
  assert.equal(metrics.validatedBenefit, 'unknown', 'the presence of advice must not certify correctness or behavior improvement')
  assert.equal(metrics.mainActionChanged, 'unknown')
  assert.equal(metrics.deliveryCount, 0, 'review completion alone cannot stand for delivery')
  assert.ok(readFileSync('eval/experiment.mjs', 'utf8').includes("'supervise'"))
  console.log('Comprehensive review identity/behavior metrics self-tests passed; fixture processes only, no model calls')
} finally { rmSync(dir, { recursive: true, force: true }) }
