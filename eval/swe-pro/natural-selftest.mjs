import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { command } from './docker.mjs'
const preview = (...args) => JSON.parse(execFileSync(process.execPath, ['eval/swe-pro/run.mjs', '--dry-run', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
assert.equal(preview().taskTimeoutMs, null, 'new evaluations wait for natural completion by default')
assert.equal(preview('--task-timeout-ms', 'none').taskTimeoutMs, null)
assert.equal(preview('--task-timeout-ms', '900000').taskTimeoutMs, 900000)
for (const value of ['0', '-1', 'NaN', 'Infinity', '3000001']) {
  assert.throws(() => preview('--task-timeout-ms', value))
}
const result = await command(['version', '--format', '{{.Client.Version}}'], { timeoutMs: null })
assert.equal(result.timedOut, false, 'null must not become a one-millisecond timer')
assert.equal(result.exitCode, 0)
const controller = new AbortController();controller.abort()
assert.equal((await command(['version'], { timeoutMs: null, signal: controller.signal })).cancelled, true)
console.log('Natural completion/default/explicit deadline/cancellation checks passed')
