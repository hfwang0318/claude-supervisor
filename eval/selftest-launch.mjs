import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
const dir = mkdtempSync(join(tmpdir(), 'dss-launch-selftest-'))
let work
try {
  const fake = join(dir, 'fake.mjs')
  const argvFile = join(dir, 'argv.json')
  writeFileSync(fake, `import { writeFileSync, readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; const args = process.argv.slice(2); writeFileSync(process.env.DSS_CAPTURE_ARGV, JSON.stringify(args)); const plugin = args[args.indexOf('--plugin-dir') + 1]; writeFileSync(join(dirname(process.env.DSS_CAPTURE_ARGV), 'manifest.json'), readFileSync(join(plugin, '.claude-plugin/plugin.json'))); console.log(JSON.stringify({result: 'Not fixed; tests still fail.', usage: {input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0}}))`)
  const model = { id: 'test-model-v1', version: 'v1', reasoning: 'low' }
  const config = { schemaVersion: 1, hostVersion: '2.1.295', pluginSha: 'fixture', environmentImage: 'fixture', toolPermissions: 'fixture', priceSnapshotId: 'unknown', split: 'development', stopRule: 'one', worker: model, side: model, reference: model, relation: 'same', capabilityProfileId: 'fixture', prices: {}, externalContextDisabled: true, otherPluginsDisabled: true }
  const experiment = join(dir, 'experiment.json')
  writeFileSync(experiment, JSON.stringify(config))
  execFileSync(process.execPath, ['eval/run.mjs', '--suite', 'engineering', '--experiment', experiment, '--tasks', 'simple-change', '--arms', 'on', '--reps', '1', '--jobs', '1', '--out', dir], { env: { ...process.env, DSS_CMD: process.execPath, DSS_ARGS: '', DSS_ARGV: JSON.stringify([fake]), DSS_CAPTURE_ARGV: argvFile }, timeout: 15000, stdio: 'pipe' })
  work = JSON.parse(readFileSync(join(dir, 'simple-change.on.0.json'), 'utf8')).work
  const argv = JSON.parse(readFileSync(argvFile, 'utf8'))
  assert.equal(argv.includes('--bare'), false, 'on arm must not disable its own function hooks')
  const plugin = argv[argv.indexOf('--plugin-dir') + 1]
  assert.ok(plugin)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.userConfig.worker_model.default, 'test-model-v1')
  assert.equal(manifest.userConfig.verifier_model.default, 'test-model-v1')
  console.log('launch selftest: on arm loads explicit pair without disabling function hooks; no model calls')
} finally {
  if (work?.startsWith(join(tmpdir(), 'dss-eval-simple-change-on-'))) rmSync(work, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
}
