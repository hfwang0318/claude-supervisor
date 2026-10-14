import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const flags = process.argv.slice(2)
if (flags.some(flag => !['--pure', '--host'].includes(flag)) || flags.length > 1) {
  console.error('Usage: node scripts/check.mjs [--pure|--host]; default runs all checks')
  process.exit(1)
}
const run = (name, executable, args, hostTests = false) => {
  const r = spawnSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  // 2.1.295 was observed returning status 0 even after reporting failed tests.
  const counts = hostTests ? [...text.matchAll(/^\s*(\d+) (pass|fail)\s*$/gm)] : []
  const fail = r.error || r.status !== 0 || hostTests && (!counts.some(m => m[2] === 'pass') || !counts.some(m => m[2] === 'fail' && Number(m[1]) === 0) || counts.some(m => m[2] === 'fail' && Number(m[1]) > 0))
  if (fail) {
    console.error(`${name}: FAILED\n${r.error ?? ''}\n${text.slice(-12000)}`)
    process.exit(1)
  }
  console.log(`${name}: passed${hostTests ? ` (${counts.find(m => m[2] === 'pass')?.[1]} tests)` : ''}`)
}
if (!flags.includes('--pure')) {
  run('manifest/hook contract', 'claude', ['plugin', 'validate', '.'])
  if (!existsSync(join(root, '.claude-plugin/types/tsconfig.json'))) {
    // A local plugin command handles this prompt; no model prompt is submitted.
    run('host type generation (local command)', 'claude', ['--plugin-dir', root, '--setting-sources', '', '-p', '/deepseek-supervisor issues'])
  }
  if (!existsSync(join(root, '.claude-plugin/types/tsconfig.json'))) { console.error('Host types missing: full engineering checks unavailable'); process.exit(1) }
  run('TypeScript', process.execPath, ['node_modules/typescript/bin/tsc', '-p', '.'])
  run('host tests', 'claude', ['plugin', 'test', '.'], true)
  run('real read-only facts', process.execPath, ['scripts/selftest-assist.mjs'])
  run('real scoped facts', process.execPath, ['scripts/selftest-scoped-facts.mjs'])
  run('real workspace/process isolation', process.execPath, ['scripts/selftest-workspace.mjs'])
}
if (!flags.includes('--host')) {
  for (const name of ['selftest', 'selftest-long', 'selftest-hard', 'selftest-late', 'selftest-weak', 'selftest-metrics', 'selftest-engineering', 'selftest-launch', 'selftest-assist']) run(`scorer ${name}`, process.execPath, [`eval/${name}.mjs`])
  for (const name of ['selftest', 'gateway-selftest', 'agent-selftest', 'schedule-selftest', 'incremental-selftest', 'regression-selftest']) run(`SWE Pro ${name}`, process.execPath, [`eval/swe-pro/${name}.mjs`])
}
console.log(flags.includes('--pure') ? 'Partial CI: pure/scorer checks only; host and process gates were not run.' : flags.includes('--host') ? 'Host checks passed; scorer checks were not requested.' : 'All local engineering checks passed. No paid model evaluations ran.')
