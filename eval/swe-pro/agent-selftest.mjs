import assert from 'node:assert/strict'
import { reviewSessionCanClose, parseReviewLifecycle, parseReviewControl, ReviewInputGate } from './review-session.mjs'
import { agentArgs, agentEnvironment, frozenDefaults, patchArgs } from './agent.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
const args = agentArgs('facts')
assert.equal(args.includes('--model'), true)
assert.equal(args[args.indexOf('--model') + 1], 'zhipu/glm-5.3-flash')
assert.equal(args[args.indexOf('--setting-sources') + 1], '')
assert.equal(args.includes('--strict-mcp-config'), true)
assert.equal(args.includes('--bare'), false)
assert.equal(args[args.indexOf('--tools') + 1].includes('Web'), false)
assert.equal(args.includes('/opt/eval/plugin-facts'), true)
for (const mode of ['facts', 'existing']) assert.deepEqual(frozenDefaults(mode), { verifier_model: 'zhipu/glm-5.3-flash', execution_mode: 'off', assistance_mode: mode })
assert.throws(() => frozenDefaults('probe'), /mode/)
const env = agentEnvironment()
for (const key of ['ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']) assert.equal(env[key], env.ANTHROPIC_MODEL)
assert.equal(env.ANTHROPIC_BASE_URL, 'http://model-gateway:8080')
assert.equal(env.ANTHROPIC_API_KEY, 'isolated-eval')
assert.equal(env.PATH, undefined, 'preserve image toolchain PATH')
const repo = mkdtempSync(join(tmpdir(), 'swe-pro-git-test-'))
try {
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
  git(['init', '-q'])
  git(['config', 'user.email', 'eval@example.invalid'])
  git(['config', 'user.name', 'Eval'])
  writeFileSync(join(repo, 'source.txt'), 'broken\n')
  git(['add', '-A']); git(['commit', '-qm', 'base'])
  const base = git(['rev-parse', 'HEAD']).trim()
  writeFileSync(join(repo, 'source.txt'), 'fixed\n')
  git(['add', '-A']); git(['commit', '-qm', 'fix'])
  assert.match(git(patchArgs(base)), /\+fixed/)
} finally { rmSync(repo, { recursive: true, force: true }) }
console.log('SWE Pro agent configuration self-tests passed')

const active = { active: true, followUps: 0 }
assert.equal(reviewSessionCanClose(1, active), false)
assert.equal(reviewSessionCanClose(0, { active: false, followUps: 0 }), false)
assert.equal(reviewSessionCanClose(1, { active: false, followUps: 0 }), true)
assert.equal(reviewSessionCanClose(1, { active: false, followUps: 1, acceptedFollowUps: 1 }), false)
assert.equal(reviewSessionCanClose(2, { active: false, followUps: 1, acceptedFollowUps: 1 }), true)
assert.equal(reviewSessionCanClose(1, null), false)
assert.deepEqual(parseReviewLifecycle('2026-10-16T00:00:00.000Z [DEBUG] [deepseek-supervisor] $.ui.log (to debug): deepseek-supervisor: REVIEW_LIFECYCLE {"active":true,"followUps":0}'), active)
assert.equal(parseReviewLifecycle('REVIEW_LIFECYCLE {"active":false,"followUps":-1}'), null)
assert.equal(parseReviewLifecycle('REVIEW_LIFECYCLE invalid'), null)

assert.equal(parseReviewLifecycle('tool stdout REVIEW_LIFECYCLE {"active":false,"followUps":0}'), null)

assert.deepEqual(parseReviewControl('2026-10-16T00:00:00.000Z [DEBUG] [deepseek-supervisor] $.ui.log (to debug): deepseek-supervisor: REVIEW_CONTROL {"revision":1,"status":"cancelled"}'), { revision: 1, status: 'cancelled' })
assert.equal(parseReviewControl('tool stdout REVIEW_CONTROL {"revision":1,"status":"cancelled"}'), null)
const inputGate = new ReviewInputGate()
let ready = false
const initial = inputGate.wait(0).then(() => { ready = true })
await Promise.resolve(); assert.equal(ready, false)
inputGate.observe({ revision: 0, status: 'ready' }); await initial
let forwarded = false
const waiting = inputGate.wait(1).then(() => { forwarded = true })
inputGate.observe({ revision: 0, status: 'cancelled' }); await Promise.resolve()
assert.equal(forwarded, false, 'old acknowledgement cannot admit new input')
inputGate.observe({ revision: 1, status: 'cancelled' }); await waiting
assert.equal(forwarded, true)
const missing = inputGate.wait(2)
inputGate.fail(new Error('native exited'))
await assert.rejects(missing, /native exited/)
assert.equal(reviewSessionCanClose(1, { active: false, followUps: 0 }, { inputs: 2, followUps: 0 }), false, 'the previous task result must not close a newly submitted task')
assert.equal(reviewSessionCanClose(2, { active: false, followUps: 0 }, { inputs: 2, followUps: 1 }), false, 'earlier plugin followup results are not new user task results')
assert.equal(reviewSessionCanClose(3, { active: false, followUps: 0 }, { inputs: 2, followUps: 1 }), true)

// A native child can close while its caller still has an open streaming stdin.
// The adapter must release that input reader rather than remain alive forever.
const lifecycleFixture = mkdtempSync(join(tmpdir(), 'review-session-exit-'))
try {
  const debug = join(lifecycleFixture, 'debug.log'), fake = join(lifecycleFixture, 'native.mjs')
  writeFileSync(fake, `import { appendFileSync } from 'node:fs'
const debug=process.argv[process.argv.indexOf('--debug-file')+1]
const log=x=>appendFileSync(debug,'2026-10-16T00:00:00.000Z [DEBUG] [deepseek-supervisor] $.ui.log (to debug): deepseek-supervisor: '+x+'\\n')
log('REVIEW_CONTROL {"revision":0,"status":"ready"}')
process.stdin.once('data',()=>{ log('REVIEW_LIFECYCLE {"active":false,"followUps":0}');process.stdout.write('{"type":"result"}\\n',()=>process.exit(0)) })
`)
  const helper = fileURLToPath(new URL('./review-session.mjs', import.meta.url))
  const adapter = spawn(process.execPath, [helper, process.execPath, fake, '--debug-file', debug, '--review-stream-input'], { stdio: ['pipe', 'pipe', 'pipe'] })
  adapter.stdin.on('error', () => {})
  let nativeOutput = ''
  adapter.stdout.on('data', chunk => { nativeOutput += chunk }); adapter.stderr.resume()
  adapter.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'Synthetic task.' } }) + '\n')
  let expired = false
  const limit = setTimeout(() => { expired = true; adapter.kill('SIGTERM') }, 1500)
  const [code] = await once(adapter, 'close'); clearTimeout(limit)
  assert.match(nativeOutput, /"type":"result"/, 'fixture must actually answer before testing adapter exit')
  assert.equal(expired, false, 'native exit must release an open external stdin')
  assert.equal(code, 0)
} finally { rmSync(lifecycleFixture, { recursive: true, force: true }) }

assert.equal(reviewSessionCanClose(1, { active: false, followUps: 1, acceptedFollowUps: 0 }), true, 'a rejected attempt creates no expected result')
