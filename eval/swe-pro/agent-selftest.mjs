import assert from 'node:assert/strict'
import { reviewSessionCanClose, parseReviewLifecycle } from './review-session.mjs'
import { agentArgs, agentEnvironment, frozenDefaults, patchArgs } from './agent.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
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
assert.equal(reviewSessionCanClose(1, { active: false, followUps: 1 }), false)
assert.equal(reviewSessionCanClose(2, { active: false, followUps: 1 }), true)
assert.equal(reviewSessionCanClose(1, null), false)
assert.deepEqual(parseReviewLifecycle('2026-10-16T00:00:00.000Z [DEBUG] [deepseek-supervisor] $.ui.log (to debug): deepseek-supervisor: REVIEW_LIFECYCLE {"active":true,"followUps":0}'), active)
assert.equal(parseReviewLifecycle('REVIEW_LIFECYCLE {"active":false,"followUps":-1}'), null)
assert.equal(parseReviewLifecycle('REVIEW_LIFECYCLE invalid'), null)

assert.equal(parseReviewLifecycle('tool stdout REVIEW_LIFECYCLE {"active":false,"followUps":0}'), null)
