import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyArtifacts, classifyGrade, readyPair, grade, requiredTests, prepareTask } from './docker.mjs'

const root = mkdtempSync(join(tmpdir(), 'swe-pro-test-'))
try {
  mkdirSync(join(root, 'case'))
  writeFileSync(join(root, 'case', 'instruction.md'), 'original')
  const task = { instanceId: 'case', baseCommit: 'abc', image: { pinnedReference: 'ghcr.io/image@sha256:' + 'a'.repeat(64) }, artifactSHA256: { 'instruction.md': createHash('sha256').update('original').digest('hex') } }
  verifyArtifacts(task, root)
  writeFileSync(join(root, 'case', 'instruction.md'), 'corrupt')
  assert.throws(() => verifyArtifacts(task, root), /hash/)
  const evidence = { tests: [{ name: 'target', status: 'PASSED' }] }
  assert.equal(classifyGrade({ reward: '1', exitCode: 0, evidence, required: ['target'] }).status, 'passed')
  assert.equal(classifyGrade({ reward: '0\n', exitCode: 1, evidence: { tests: [{ name: 'target', status: 'FAILED' }] }, required: ['target'] }).status, 'failed')
  assert.equal(classifyGrade({ reward: '0\n', exitCode: 127 }).status, 'environment-error')
  assert.equal(classifyGrade({ reward: '0\n', exitCode: 1, evidence: { tests: [] }, required: ['target'] }).status, 'environment-error')
  assert.equal(classifyGrade({ reward: '0\n', exitCode: 1, evidence: { tests: [] }, required: ['target'], calibrated: true }).status, 'failed')
  assert.equal(readyPair({ status: 'environment-error', rawReward: '0', parsedTests: 0, verifierExitCode: 1, requiredTests: 1 }, { status: 'passed', reward: 1 }), true)
  assert.equal(classifyGrade({ reward: '1', exitCode: 0, evidence, required: ['other'] }).status, 'environment-error')
  assert.equal(classifyGrade({ reward: '0', exitCode: 1, evidence: { tests: [{ name: 'suite before each hook', status: 'FAILED' }] }, required: ['suite target'] }).status, 'failed')
  for (const reward of [undefined, '', 'yes', '1\n0']) assert.equal(classifyGrade({ reward, exitCode: 0 }).status, 'environment-error')
  assert.equal(classifyGrade({ reward: '1', exitCode: 1 }).status, 'environment-error')
  assert.equal(classifyGrade({ reward: '1', exitCode: 0, timedOut: true }).status, 'timeout')
  assert.equal(classifyGrade({ reward: '1', exitCode: 0, cancelled: true }).status, 'cancelled')
  assert.equal(readyPair({ status: 'failed', reward: 0 }, { status: 'passed', reward: 1 }), true)
  assert.equal(readyPair({ status: 'timeout', reward: 0 }, { status: 'passed', reward: 1 }), false)
  assert.deepEqual(requiredTests({ fail_to_pass: "['suite | quoted \\'name\\'']", pass_to_pass: ['regression'] }), ["suite | quoted 'name'", 'regression'])
  const calls = []
  const exec = async args => { calls.push(args); if (args.some(a => a.includes('rev-parse'))) return { exitCode: 0, stdout: 'abc\n', stderr: '' }; if (args.some(a => a.includes('git apply'))) return { exitCode: 1, stdout: '', stderr: 'bad patch' }; return { exitCode: 0, stdout: '', stderr: '' } }
  const receipt = await grade(task, root, 'bad patch', join(root, 'receipt'), { exec, skipArtifactCheck: true })
  assert.equal(receipt.status, 'patch-error')
  assert.equal(calls.some(c => c.includes('bash /tests/test.sh')), false)
  assert.equal(calls.at(-1)[0], 'rm')
  assert.equal(calls.find(c => c[0] === 'run').some(a => a === '-v' || a === '--mount'), false)
  writeFileSync(join(root, 'case', 'instruction.md'), 'original')
  const prepared = join(root, 'prepared')
  mkdirSync(prepared)
  const cache = { task: task.instanceId, image: task.image.pinnedReference, empty: { status: 'failed', reward: 0 }, reference: { status: 'passed', reward: 1 }, ready: true }
  writeFileSync(join(prepared, 'readiness.json'), JSON.stringify(cache))
  let invoked = 0
  assert.equal((await prepareTask(task, root, prepared, { exec: async () => { invoked++; return { exitCode: 1, stderr: 'controlled pull error' } } })).ready, true)
  assert.equal(invoked, 0)
  writeFileSync(join(prepared, 'readiness.json'), JSON.stringify({ ...cache, image: 'different' }))
  assert.equal((await prepareTask(task, root, prepared, { exec: async () => { invoked++; return { exitCode: 1, stderr: 'controlled pull error' } } })).ready, false)
  assert.equal(invoked, 1)
  mkdirSync(join(root, 'case/tests'), { recursive: true })
  writeFileSync(join(root, 'case/tests/config.json'), JSON.stringify({ fail_to_pass: ['target'], pass_to_pass: [] }))
  const reused = join(root, 'reused')
  mkdirSync(join(reused, 'verifier'), { recursive: true })
  writeFileSync(join(reused, 'verifier/reward.txt'), '1')
  writeFileSync(join(reused, 'verifier/output.json'), JSON.stringify(evidence))
  const copyNewFailure = async args => {
    if (args.some(a => a.includes('rev-parse'))) return { exitCode: 0, stdout: 'abc\n', stderr: '' }
    if (args.some(a => a.includes('bash /tests/test.sh'))) return { exitCode: 1, stdout: '', stderr: '' }
    if (args[0] === 'cp' && args[1].endsWith(':/logs/verifier')) {
      const dest = existsSync(args[2]) ? join(args[2], 'verifier') : args[2]
      mkdirSync(dest, { recursive: true })
      writeFileSync(join(dest, 'reward.txt'), '0')
      writeFileSync(join(dest, 'output.json'), JSON.stringify({ tests: [{ name: 'target', status: 'FAILED' }] }))
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  assert.equal((await grade(task, root, '', reused, { exec: copyNewFailure, skipArtifactCheck: true })).status, 'failed')
  console.log('SWE Pro grading self-tests passed')
} finally { rmSync(root, { recursive: true, force: true }) }
