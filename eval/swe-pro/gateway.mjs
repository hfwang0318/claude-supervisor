import http from 'node:http'
import https from 'node:https'
import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'

export const MODEL = 'zhipu/glm-5.3-flash'
export const MODEL_POLICY = { provider: 'Zhipu Coding Plan', source: 'https://docs.bigmodel.cn/cn/coding-plan/overview', checkedOn: '2026-10-14', servedModel: 'glm-5.3-flash', legacyAliasUpgrade: true }
export const assertEvaluationModel = model => {
  if (['zhipu/glm-5.2', 'zhipu/glm-5.1'].includes(model)) throw Error('Coding Plan remaps GLM-5.2 / GLM-5.1 to GLM-5.3; legacy names cannot establish model identity')
  if (model !== MODEL || model !== `zhipu/${MODEL_POLICY.servedModel}`) throw Error('model is not approved for the current evaluation policy')
}
export const allowedRequest = (method, path, body) => method === 'POST' && /^\/v1\/messages(?:\/count_tokens)?(?:\?beta=true)?$/.test(path) && body?.model === MODEL && (path.split('?')[0].endsWith('/count_tokens') || (Number.isSafeInteger(body.max_tokens) && body.max_tokens > 0 && body.max_tokens <= 32768))
export const actualModelAllowed = model => [MODEL_POLICY.servedModel, MODEL].includes(model)
export const auditEvent = event => {
  const message = event.type === 'message_start' ? event.message : event
  const usage = message?.usage ?? event.usage ?? {}
  return { type: ['message_start', 'message_delta'].includes(event.type) ? event.type : 'response', ...(message?.model ? { model: message.model, identityOK: actualModelAllowed(message.model) } : {}), ...(Number.isFinite(usage.input_tokens) ? { input: usage.input_tokens } : {}), ...(Number.isFinite(usage.output_tokens) ? { output: usage.output_tokens } : {}), ...(Number.isFinite(usage.cache_read_input_tokens) ? { cached: usage.cache_read_input_tokens } : {}), ...(Number.isFinite(usage.cache_creation_input_tokens) ? { created: usage.cache_creation_input_tokens } : {}) }
}

export const startGateway = ({ upstream, apiKey, relayToken, auditPath, port = 0, bind = '127.0.0.1', requireRelayToken = false }) => {
  const record = row => { const text = JSON.stringify({ time: new Date().toISOString(), ...row }); if (auditPath) appendFileSync(auditPath, text + '\n'); else console.log(text) }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') { res.end('ok'); return }
    if (requireRelayToken && req.headers['x-eval-relay-token'] !== relayToken) { res.writeHead(403).end(); return }
    let body
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw Error('body limit'); chunks.push(chunk) }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { res.writeHead(400).end('invalid request'); return }
    if (!allowedRequest(req.method, req.url, body)) {
      record({ type: 'request-rejected', method: req.method, path: req.url.split('?')[0], model: typeof body.model === 'string' ? body.model.slice(0, 100) : null, maxOutput: body.max_tokens })
      res.writeHead(403).end('route or model rejected'); return
    }
    const requestId = randomUUID()
    record({ requestId, type: 'request', model: body.model, maxOutput: body.max_tokens, stream: body.stream === true })
    const target = new URL(req.url, upstream)
    const transport = target.protocol === 'https:' ? https : http
    const headers = { 'content-type': 'application/json', 'anthropic-version': req.headers['anthropic-version'] ?? '2023-06-01', ...(apiKey ? { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` } : {}), ...(relayToken && !requireRelayToken ? { 'x-eval-relay-token': relayToken } : {}) }
    if (req.headers['anthropic-beta']) headers['anthropic-beta'] = req.headers['anthropic-beta']
    const request = transport.request(target, { method: 'POST', headers, timeout: 600_000 }, response => {
      // Observe the streaming identity before forwarding any response bytes.
      const decoder = new StringDecoder('utf8')
      let pending = '', whole = '', identity = false, rejected = false
      res.writeHead(response.statusCode, { 'content-type': response.headers['content-type'] ?? 'application/json' })
      response.on('data', chunk => {
        const text = decoder.write(chunk)
        if (body.stream) {
          pending += text
          let newline
          while ((newline = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)), audit = auditEvent(event)
                if (audit.model) { identity = audit.identityOK; if (!identity) { rejected = true; record({ requestId, type: 'identity-mismatch', model: audit.model }); response.destroy(); res.destroy(); return } }
                if (event.type === 'message_start' || event.type === 'message_delta') record({ requestId, ...audit })
              } catch {}
            }
            if (!rejected) res.write(line + '\n')
          }
        } else {
          whole += text
          if (whole.length > 8 * 1024 * 1024) { response.destroy(); res.destroy() }
        }
      })
      response.on('end', () => {
        if (rejected) return
        if (body.stream) {
          if (pending) res.write(pending)
          if (response.statusCode === 200 && !identity && !req.url.split('?')[0].endsWith('/count_tokens')) record({ requestId, type: 'identity-missing' })
          res.end()
        } else {
          try {
            const event = JSON.parse(whole), audit = auditEvent(event)
            if (!req.url.split('?')[0].endsWith('/count_tokens') && response.statusCode === 200 && !audit.identityOK) { record({ requestId, type: 'identity-mismatch', model: audit.model ?? null }); res.destroy(); return }
            record({ requestId, ...audit, status: response.statusCode })
          } catch { record({ requestId, type: 'non-json-response', status: response.statusCode }) }
          res.end(whole)
        }
      })
      response.on('error', () => { record({ requestId, type: 'upstream-response-error' }); res.destroy() })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => { record({ requestId, type: 'upstream-error' }); if (!res.headersSent) res.writeHead(502); res.end('model endpoint unavailable') })
    res.on('close', () => { if (!res.writableEnded) request.destroy() })
    request.end(JSON.stringify(body))
  })
  return new Promise(ok => server.listen(port, bind, () => ok(server)))
}

export const currentRoute = () => {
  const settings = JSON.parse(readFileSync(join(homedir(), '.claude/settings.json')))
  const upstream = settings.env?.ANTHROPIC_BASE_URL
  if (!upstream || !settings.apiKeyHelper) throw Error('configured Claude route and key helper required')
  const apiKey = execFileSync('/bin/sh', ['-c', settings.apiKeyHelper], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (!apiKey) throw Error('empty credential helper result')
  return { upstream, apiKey }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const forward = process.env.EVAL_FORWARD_URL
  let upstream = forward, apiKey
  if (!forward) {
    ;({ upstream, apiKey } = currentRoute())
  }
  const server = await startGateway({ upstream, apiKey, relayToken: process.env.EVAL_RELAY_TOKEN, auditPath: process.env.EVAL_AUDIT_PATH, port: Number(process.env.EVAL_PORT ?? '0'), bind: forward ? '0.0.0.0' : '127.0.0.1', requireRelayToken: !forward })
  console.log(JSON.stringify({ port: server.address().port, model: MODEL, forwarding: Boolean(forward) }))
}
