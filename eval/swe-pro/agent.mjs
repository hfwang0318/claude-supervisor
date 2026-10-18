import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { command } from './docker.mjs'
import { MODEL, currentRoute, startGateway } from './gateway.mjs'

export const NODE_IMAGE = 'node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392'
const normalizedReviewPolicy = policy => {
  if (!policy || !['incremental', 'legacy'].includes(policy.schedule) || Object.keys(policy).some(key => !['schedule', 'interval', 'maxCalls', 'outputTokens'].includes(key)) || !Number.isSafeInteger(policy.interval) || policy.interval < 1 || policy.interval > 100 || !Number.isSafeInteger(policy.maxCalls) || policy.maxCalls < 1 || policy.maxCalls > 100 || !Number.isSafeInteger(policy.outputTokens) || policy.outputTokens < 1 || policy.outputTokens > 1000000) throw Error('invalid review policy')
  return { schedule: policy.schedule, interval: policy.interval, maxCalls: policy.maxCalls, outputTokens: policy.outputTokens }
}
export const frozenDefaults = (mode, { reviewPhase = 'auto', reviewPolicy } = {}) => {
  if (!['facts', 'existing', 'supervise'].includes(mode)) throw Error('invalid mode')
  if (!['auto', 'plan', 'exploration', 'implementation', 'failure', 'completion'].includes(reviewPhase) || reviewPhase !== 'auto' && mode !== 'supervise') throw Error('invalid review phase for assistance mode')
  return { verifier_model: MODEL, execution_mode: 'off', assistance_mode: mode, ...(reviewPhase !== 'auto' ? { review_phase: reviewPhase } : {}), ...(reviewPolicy ? (() => { const p = normalizedReviewPolicy(reviewPolicy); return { review_schedule: p.schedule, review_interval: String(p.interval), review_max_calls: String(p.maxCalls), review_output_budget: String(p.outputTokens) } })() : {}) }
}
export const agentArgs = mode => {
  frozenDefaults(mode)
  return ['/opt/eval/claude', '-p', '--model', MODEL, '--setting-sources', '', '--settings', '{"autoMemoryEnabled":false}', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', 'Read,Write,Edit,Bash,Glob,Grep', '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,Agent', '--disable-slash-commands', '--plugin-dir', `/opt/eval/plugin-${mode}`, '--output-format', 'stream-json', '--verbose', '--debug-file', '/logs/agent/debug.log', '--no-session-persistence']
}
export const agentEnvironment = () => ({
  HOME: '/root', CLAUDE_CONFIG_DIR: '/root/.claude-eval', ANTHROPIC_API_KEY: 'isolated-eval', ANTHROPIC_BASE_URL: 'http://model-gateway:8080', ANTHROPIC_MODEL: MODEL,
  ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL, CLAUDE_CODE_SUBAGENT_MODEL: MODEL,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DISABLE_AUTOUPDATER: '1', IS_SANDBOX: '1', CODE_SUPERVISOR: 'on'
})
const quote = text => `'${text.replaceAll("'", "'\\''")}'`
export const patchArgs = baseCommit => ['diff', '--cached', '--binary', baseCommit]
export const treeHash = root => {
  const hash = createHash('sha256')
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), rel = prefix + name
      if (lstatSync(path).isDirectory()) walk(path, rel + '/')
      else { hash.update(rel); hash.update(readFileSync(path)) }
    }
  }
  walk(root)
  return hash.digest('hex')
}
export const armModes = (experimentalMode = 'facts') => {
  if (!['facts', 'supervise'].includes(experimentalMode)) throw Error('invalid experimental mode')
  return { existing: 'existing', facts: experimentalMode }
}
export const assertRuntimeModes = (runtime, identity, experimentalMode = 'facts') => {
  const expected = armModes(experimentalMode), actual = identity.armModes ?? armModes()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('runtime assistance mode differs from requested mode')
  const reviewPhase = identity.reviewPhase ?? 'auto', reviewPolicy = identity.reviewPolicy
  frozenDefaults(expected.facts, { reviewPhase, reviewPolicy })
  for (const [slot, mode] of Object.entries(expected)) {
    const config = JSON.parse(readFileSync(join(runtime, `plugin-${slot}/.claude-plugin/plugin.json`)))
    const phase = mode === 'supervise' ? reviewPhase : 'auto'
    if ((config.userConfig?.review_phase?.default ?? 'auto') !== phase) throw Error(`runtime review phase config mismatch: ${slot}`)
    if (!reviewPolicy && config.userConfig?.review_schedule?.default && config.userConfig.review_schedule.default !== 'legacy') throw Error('runtime review policy identity missing')
    for (const [key, value] of Object.entries(frozenDefaults(mode, { reviewPhase: phase, reviewPolicy }))) if (config.userConfig?.[key]?.default !== value) throw Error(`runtime mode config mismatch: ${slot}/${key}`)
  }
  return expected
}
export const freezeRuntime = (root, runtime, { experimentalMode = 'facts', reviewPhase = 'auto', reviewPolicy = { schedule: reviewPhase === 'auto' ? 'incremental' : 'legacy', interval: 5, maxCalls: reviewPhase === 'auto' ? 3 : 2, outputTokens: reviewPhase === 'auto' ? 12000 : 4000 } } = {}) => {
  const modes = armModes(experimentalMode)
  reviewPolicy = normalizedReviewPolicy(reviewPolicy)
  frozenDefaults(modes.facts, { reviewPhase, reviewPolicy })
  const manifest = JSON.parse(readFileSync(join(runtime, 'manifest.json')))
  if (manifest.version !== '2.1.295' || createHash('sha256').update(readFileSync(join(runtime, 'claude'))).digest('hex') !== manifest.platforms['linux-x64'].checksum) throw Error('Claude runtime checksum mismatch')
  for (const mode of ['existing', 'facts']) {
    const plugin = join(runtime, `plugin-${mode}`)
    if (existsSync(plugin)) throw Error('runtime already frozen; use stored identity or a new directory')
    for (const dir of ['hooks', 'supervisor', 'types', 'scripts', '.claude-plugin']) cpSync(join(root, dir), join(plugin, dir), { recursive: true, filter: path => !path.includes('/.claude-plugin/types') })
    const file = join(plugin, '.claude-plugin/plugin.json'), config = JSON.parse(readFileSync(file))
    for (const [key, value] of Object.entries(frozenDefaults(modes[mode], { reviewPhase: modes[mode] === 'supervise' ? reviewPhase : 'auto', reviewPolicy }))) config.userConfig[key].default = value
    writeFileSync(file, JSON.stringify(config, null, 2))
  }
  cpSync(join(root, 'eval/swe-pro/gateway.mjs'), join(runtime, 'gateway.mjs'))
  cpSync(join(root, 'eval/swe-pro/review-session.mjs'), join(runtime, 'review-session.mjs'))
  const receipt = { reviewSessionSHA256: createHash('sha256').update(readFileSync(join(runtime, 'review-session.mjs'))).digest('hex'), armModes: modes, reviewPhase, reviewPolicy, model: MODEL, sideModel: MODEL, claudeVersion: manifest.version, claudeSHA256: manifest.platforms['linux-x64'].checksum, nodeSHA256: createHash('sha256').update(readFileSync(join(runtime, 'node'))).digest('hex'), nodeImage: NODE_IMAGE, pluginHashes: Object.fromEntries(['existing', 'facts'].map(mode => [mode, treeHash(join(runtime, `plugin-${mode}`))])), gatewaySHA256: createHash('sha256').update(readFileSync(join(runtime, 'gateway.mjs'))).digest('hex') }
  writeFileSync(join(runtime, 'identity.json'), JSON.stringify(receipt, null, 2))
  return receipt
}

export const openModelNetwork = async (runtime, auditPath) => {
  const id = randomUUID(), name = `dss-model-${id}`, network = `dss-internal-${id}`
  const relayToken = randomUUID()
  const server = await startGateway({ ...currentRoute(), relayToken, auditPath, requireRelayToken: true })
  const checked = async args => { const r = await command(args); if (r.exitCode !== 0) throw Error(r.stderr.slice(-1000)); return r }
  const close = async () => { await command(['logs', name], { log: auditPath + '.proxy.log' }); await command(['rm', '-f', name]); await command(['network', 'rm', network]); server.closeAllConnections(); await new Promise(ok => server.close(ok)) }
  try {
    await checked(['network', 'create', '--internal', network])
    await checked(['run', '-d', '--name', name, '--platform', 'linux/amd64', '--memory', '128m', '--cpus', '0.25', '--pids-limit', '64', '--cap-drop', 'ALL', '--mount', `type=bind,source=${runtime},target=/opt/eval,readonly`, '-e', `EVAL_FORWARD_URL=http://host.docker.internal:${server.address().port}`, '-e', `EVAL_RELAY_TOKEN=${relayToken}`, '-e', 'EVAL_PORT=8080', NODE_IMAGE, 'node', '/opt/eval/gateway.mjs'])
    await checked(['network', 'connect', '--alias', 'model-gateway', network, name])
    await checked(['exec', name, 'node', '-e', "for(let n=0;n<100;n++){try{const r=await fetch('http://127.0.0.1:8080/health');if(r.status===200)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,100))}process.exit(1)"])
    return { network, gateway: name, close }
  } catch (error) { await close(); throw error }
}

export const runAgent = async (task, instruction, mode, runtime, network, out, { timeoutMs = null, preflight = false, signal } = {}) => {
  mkdirSync(out, { recursive: true })
  const name = `dss-agent-${randomUUID()}`, started = Date.now()
  const identity = JSON.parse(readFileSync(join(runtime, 'identity.json')))
  const modes = assertRuntimeModes(runtime, identity, identity.armModes?.facts ?? 'facts')
  if (!Object.hasOwn(modes, mode)) throw Error('invalid logical arm')
  const receipt = { task: task.instanceId, mode, assistanceMode: modes[mode], model: MODEL, status: 'setup-error' }
  let patch = ''
  const checked = async args => { const r = await command(args); if (r.exitCode !== 0) throw Error(r.stderr.slice(-1000)); return r }
  try {
    await checked(['run', '-d', '--name', name, '--platform', 'linux/amd64', '--network', network, '--cpus', '1', '--memory', '4096m', '--pids-limit', '1024', '--cap-drop', 'ALL', '--mount', `type=bind,source=${runtime},target=/opt/eval,readonly`, '--entrypoint', '/bin/bash', task.image.pinnedReference, '-c', 'sleep infinity'])
    const head = await checked(['exec', name, 'bash', '-c', 'cd /app 2>/dev/null || cd /testbed; git rev-parse HEAD'])
    if (head.stdout.trim() !== task.baseCommit) throw Error('agent image base commit mismatch')
    await checked(['exec', name, 'bash', '-c', 'mkdir -p /logs/agent /root/.claude-eval; test ! -e /tests/test.sh; test ! -e /solution/gold_patch.diff'])
    const env = Object.entries(agentEnvironment()).flatMap(([k, v]) => ['-e', `${k}=${v}`])
    // Shell text contains only fixed command/paths and quoted argv; task text goes to stdin.
    const historical = !preflight && modes[mode] === 'supervise'
    if (historical && (!identity.reviewSessionSHA256 || createHash('sha256').update(readFileSync(join(runtime, 'review-session.mjs'))).digest('hex') !== identity.reviewSessionSHA256)) throw Error('historical session driver identity mismatch; freeze a new runtime')
    receipt.headlessLifecycle = historical ? 'stream-open-review-terminal' : 'single-shot'
    const nativeArgs = preflight ? ['/opt/eval/claude', '--plugin-dir', '/opt/eval/plugin-facts', '--setting-sources', '', '-p', '/code-supervisor issues'] : agentArgs(mode)
    const args = historical ? ['/opt/eval/node', '/opt/eval/review-session.mjs', ...nativeArgs] : nativeArgs
    const ran = await command(['exec', '-i', ...env, name, 'bash', '-c', `cd /app 2>/dev/null || cd /testbed; export PATH="/opt/eval:$PATH"; ${args.map(quote).join(' ')}`], { input: preflight ? undefined : instruction, timeoutMs, signal, log: join(out, 'trajectory.jsonl') })
    receipt.status = ran.cancelled ? 'cancelled' : ran.timedOut ? 'timeout' : ran.exitCode === 0 ? 'completed' : 'agent-error'
    receipt.trajectoryTruncated = ran.truncated
    receipt.exitCode = ran.exitCode
    if (ran.timedOut || ran.cancelled) {
      await checked(['stop', '-t', '1', name])
      // Restart only the keepalive entrypoint to recover the timed-out agent's
      // partial patch after every model process and descendant has been killed.
      await checked(['start', name])
    }
    const captured = await command(['exec', name, 'bash', '-c', `cd /app 2>/dev/null || cd /testbed; git rev-parse HEAD && git add -A && git ${patchArgs(task.baseCommit).map(quote).join(' ')} > /logs/agent/model.patch && git reset -q`])
    receipt.agentHead = captured.stdout.trim()
    if (captured.exitCode !== 0) receipt.status = 'capture-error'
    await command(['cp', `${name}:/logs/agent`, join(out, 'agent')])
    const patchPath = join(out, 'agent/model.patch')
    if (existsSync(patchPath)) patch = readFileSync(patchPath, 'utf8')
    receipt.patchSHA256 = createHash('sha256').update(patch).digest('hex')
    receipt.patchBytes = Buffer.byteLength(patch)
    receipt.patchAvailable = existsSync(patchPath)
  } catch (error) { receipt.error = error.message }
  finally {
    // Destroy all descendants before any verifier is started.
    await command(['rm', '-f', name])
    receipt.elapsedMs = Date.now() - started
    writeFileSync(join(out, 'agent-receipt.json'), JSON.stringify(receipt, null, 2))
  }
  return { receipt, patch }
}
