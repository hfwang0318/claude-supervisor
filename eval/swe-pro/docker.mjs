import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'

export const command = (args, { timeoutMs = 300_000, log, input, signal } = {}) => new Promise((ok, reject) => {
  if (signal?.aborted) { ok({ exitCode: null, timedOut: false, cancelled: true, stdout: '', stderr: '' }); return }
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const out = [], err = []
  let bytes = 0, timedOut = false, cancelled = false, truncated = false
  const retain = (target, chunk) => { if (bytes < 20 * 1024 * 1024) { target.push(chunk); bytes += chunk.length } else truncated = true }
  child.stdout.on('data', chunk => retain(out, chunk))
  child.stderr.on('data', chunk => retain(err, chunk))
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
  const cancel = () => { cancelled = true; child.kill('SIGKILL') }
  signal?.addEventListener('abort', cancel, { once: true })
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('close', exitCode => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    const result = { exitCode, timedOut, cancelled, truncated, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }
    if (log) writeFileSync(log, result.stdout + result.stderr)
    ok(result)
  })
})

export const verifyArtifacts = (task, tasksRoot) => {
  if (!/^instance_[A-Za-z0-9_.-]+$/.test(task.instanceId) && task.instanceId !== 'case') throw Error('invalid task ID')
  for (const [name, hash] of Object.entries(task.artifactSHA256)) {
    const path = resolve(tasksRoot, task.instanceId, name)
    if (!path.startsWith(resolve(tasksRoot, task.instanceId) + '/')) throw Error('artifact path escapes task')
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw Error(`artifact hash mismatch: ${name}`)
  }
}

export const classifyGrade = ({ reward, exitCode, timedOut, cancelled, evidence, required = [], calibrated = false }) => {
  if (cancelled) return { status: 'cancelled', reward: null }
  if (timedOut) return { status: 'timeout', reward: null }
  if (typeof reward !== 'string' || !/^[01]\s*$/.test(reward) || (reward.trim() === '1' && exitCode !== 0)) return { status: 'environment-error', reward: null }
  const rows = evidence?.tests
  if (!Array.isArray(rows) || !required.length || !(rows.length === 0 && calibrated && reward.trim() === '0' && exitCode === 1) && !rows.some(t => typeof t.name === 'string' && t.name && ['PASSED', 'FAILED', 'ERROR', 'SKIPPED'].includes(t.status))) return { status: 'environment-error', reward: null }
  const passed = new Set(rows.filter(t => t.status === 'PASSED').map(t => t.name))
  if (reward.trim() === '1' && !required.every(name => passed.has(name))) return { status: 'environment-error', reward: null }
  return { status: reward.trim() === '1' ? 'passed' : 'failed', reward: Number(reward.trim()) }
}

export const readyPair = (empty, reference) => reference?.status === 'passed' && reference.reward === 1 && (empty?.status === 'failed' && empty.reward === 0 || empty?.status === 'environment-error' && empty.rawReward === '0' && empty.parsedTests === 0 && empty.requiredTests > 0 && empty.verifierExitCode === 1 && !empty.evidenceError)
export const requiredTests = config => {
  // Official task configs contain both JSON arrays and Python string-list
  // literals. ast.literal_eval parses data only; never execute task strings.
  const script = "import json,ast,sys\nc=json.load(sys.stdin)\nr=[]\nfor k in ['fail_to_pass','pass_to_pass']:\n v=c.get(k,[])\n if isinstance(v,str):\n  try:v=json.loads(v)\n  except ValueError:v=ast.literal_eval(v)\n if not isinstance(v,list) or any(not isinstance(x,str) for x in v):raise ValueError('invalid test scope')\n r.extend(v)\nprint(json.dumps(list(dict.fromkeys(r))))"
  return JSON.parse(execFileSync('python3', ['-c', script], { input: JSON.stringify(config), encoding: 'utf8', timeout: 2000, maxBuffer: 1024 * 1024 }))
}

export const grade = async (task, tasksRoot, patch, out, { exec = command, skipArtifactCheck = false, signal, calibrated = false } = {}) => {
  if (!skipArtifactCheck) verifyArtifacts(task, tasksRoot)
  if (!/^ghcr\.io\/scaleapi\/swe-bench_pro-v2@sha256:[a-f0-9]{64}$/.test(task.image.pinnedReference) && exec === command) throw Error('unpinned image')
  mkdirSync(out, { recursive: true })
  const name = `dss-grade-${randomUUID()}`
  const started = Date.now()
  const receipt = { task: task.instanceId, image: task.image.pinnedReference, baseCommit: task.baseCommit, patchSHA256: createHash('sha256').update(patch).digest('hex'), status: 'environment-error', reward: null }
  const checked = async (args, options) => {
    const r = await exec(args, options)
    if (r.exitCode !== 0 || r.timedOut) throw Error(`docker ${args[0]} failed: ${r.stderr.slice(-1000)}`)
    return r
  }
  try {
    await checked(['run', '-d', '--name', name, '--platform', 'linux/amd64', '--cpus', '1', '--memory', '4096m', '--pids-limit', '1024', '--cap-drop', 'NET_RAW', '--entrypoint', '/bin/bash', task.image.pinnedReference, '-c', 'sleep infinity'])
    const head = await checked(['exec', name, 'bash', '-c', 'cd /app 2>/dev/null || cd /testbed; git rev-parse HEAD'])
    if (head.stdout.trim() !== task.baseCommit) throw Error('image base commit mismatch')
    if (patch) {
      writeFileSync(join(out, 'candidate.patch'), patch)
      await checked(['cp', join(out, 'candidate.patch'), `${name}:/tmp/candidate.patch`])
      const applied = await exec(['exec', name, 'bash', '-c', 'cd /app 2>/dev/null || cd /testbed; git apply --check /tmp/candidate.patch && git apply /tmp/candidate.patch'], { log: join(out, 'apply.log') })
      if (applied.exitCode !== 0 || applied.timedOut) { receipt.status = 'patch-error'; return receipt }
    }
    await checked(['cp', join(tasksRoot, task.instanceId, 'tests'), `${name}:/tests`])
    await checked(['exec', name, 'mkdir', '-p', '/logs/verifier'])
    const ran = await exec(['exec', name, 'bash', '-c', 'bash /tests/test.sh'], { timeoutMs: 3_000_000, log: join(out, 'verifier.log'), signal })
    // docker exec timeout does not kill descendants; stop before collecting logs.
    if (ran.timedOut || ran.cancelled) await exec(['stop', '-t', '1', name])
    const copied = await exec(['cp', `${name}:/logs/verifier`, join(out, 'verifier')])
    const rewardPath = join(out, 'verifier', 'reward.txt')
    let evidence, required = []
    try {
      evidence = JSON.parse(readFileSync(join(out, 'verifier/output.json')))
      const config = JSON.parse(readFileSync(join(tasksRoot, task.instanceId, 'tests/config.json')))
      required = requiredTests(config)
    } catch (error) { receipt.evidenceError = error.message }
    const rawReward = copied.exitCode === 0 && existsSync(rewardPath) ? readFileSync(rewardPath, 'utf8') : undefined
    receipt.rawReward = rawReward?.trim() ?? null
    receipt.parsedTests = evidence?.tests?.length ?? null
    receipt.requiredTests = required.length
    Object.assign(receipt, classifyGrade({ reward: rawReward, exitCode: ran.exitCode, timedOut: ran.timedOut, cancelled: ran.cancelled, evidence, required, calibrated }))
    if (receipt.status === 'failed' && evidence?.tests?.length === 0) receipt.failedBeforeTests = true
    receipt.verifierExitCode = ran.exitCode
  } catch (error) { receipt.error = error.message }
  finally {
    await exec(['rm', '-f', name])
    receipt.elapsedMs = Date.now() - started
    writeFileSync(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2))
  }
  return receipt
}
