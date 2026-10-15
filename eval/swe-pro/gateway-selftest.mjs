import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowedRequest, actualModelAllowed, auditEvent, startGateway, MODEL } from './gateway.mjs'
const { assertEvaluationModel } = await import('./gateway.mjs')
assert.equal(typeof assertEvaluationModel, 'function', 'published provider policy must gate the evaluation model')
assert.doesNotThrow(() => assertEvaluationModel('zhipu/glm-5.3-flash'))
assert.throws(() => assertEvaluationModel('zhipu/glm-5.2'), /Coding Plan.*GLM-5.2.*GLM-5.3/)
assert.throws(() => assertEvaluationModel('zhipu/glm-5.1'), /Coding Plan/)
assert.throws(() => assertEvaluationModel('zhipu/glm-5.3'), /approved/)
assert.equal(allowedRequest('POST', '/v1/messages', { model: 'zhipu/glm-5.3-flash', max_tokens: 2000 }), true)
assert.equal(allowedRequest('POST', '/v1/messages?beta=true', { model: 'zhipu/glm-5.3-flash', max_tokens: 32000 }), true)
assert.equal(allowedRequest('POST', '/v1/messages?target=https://example.com', { model: 'zhipu/glm-5.3-flash', max_tokens: 1 }), false)
for (const path of ['/v1/messages?target=https://example.com', '/v1/models', '/../../secret', 'https://example.com']) assert.equal(allowedRequest('POST', path, { model: 'zhipu/glm-5.3-flash', max_tokens: 1 }), false)
for (const model of ['glm-5.2', 'zhipu/glm-5.3', 'zhipu/glm-5.3[1m]', 'opus', undefined]) assert.equal(allowedRequest('POST', '/v1/messages', { model, max_tokens: 1 }), false)
assert.equal(allowedRequest('GET', '/v1/messages', {}), false)
assert.equal(allowedRequest('POST', '/v1/messages', { model: 'zhipu/glm-5.3-flash', max_tokens: 999999 }), false)
assert.equal(actualModelAllowed('glm-5.3-flash'), true)
assert.equal(actualModelAllowed('glm-5.3'), false)
const audit = auditEvent({ type: 'message_start', message: { model: 'glm-5.3-flash', usage: { input_tokens: 15 }, content: [{ text: 'secret' }] } })
assert.equal(audit.model, 'glm-5.3-flash')
assert.equal(audit.input, 15)
assert.equal(JSON.stringify(audit).includes('secret'), false)
assert.equal(auditEvent({ type: 'message', model: 'glm-5.3-flash', usage: { input_tokens: 1, output_tokens: 2 } }).type, 'response')
// Real loopback sockets distinguish downstream cancellation from upstream failure.
const exerciseTransport = async mode => {
  const dir = mkdtempSync(join(tmpdir(), 'supervisor-gateway-'))
  const auditPath = join(dir, 'audit.jsonl')
  let received
  const receipt = new Promise(resolve => { received = resolve })
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) {} // Finish upload before cancelling the client.
    received()
    if (mode === 'reset') res.destroy()
    if (mode === 'partial') res.write('{', () => res.destroy())
    if (mode === 'cancel-headers') res.flushHeaders()
    if (mode === 'cancel-body') res.write('{')
    if (mode === 'answer') res.end(JSON.stringify({ model: MODEL, usage: { input_tokens: 1, output_tokens: 1 } }))
    if (mode === 'identity') res.end(JSON.stringify({ model: 'wrong-model' }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const gateway = await startGateway({ upstream: `http://127.0.0.1:${upstream.address().port}`, auditPath })
  try {
    const client = http.request(`http://127.0.0.1:${gateway.address().port}/v1/messages`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } })
    const finished = new Promise(resolve => {
      client.on('error', resolve)
      client.on('response', response => { response.resume(); response.on('end', resolve); response.on('error', resolve) })
    })
    client.end(JSON.stringify({ model: MODEL, max_tokens: 4048, stream: false, messages: [{ role: 'user', content: 'synthetic offline fixture' }] }))
    await receipt
    if (mode === 'cancel-headers' || mode === 'cancel-body') {
      const wanted = mode === 'cancel-headers' ? 'upstream-headers' : 'upstream-first-byte'
      let observed = false
      for (let attempt = 0; attempt < 100; attempt++) {
        observed = readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse).some(row => row.type === wanted)
        if (observed) break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.equal(observed, true, `${wanted} must be observable before cancellation`)
    }
    if (mode.startsWith('cancel')) client.destroy()
    await finished
    let rows = []
    for (let attempt = 0; attempt < 100; attempt++) {
      rows = readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse)
      if (rows.some(row => ['transport-end', 'upstream-error', 'upstream-response-error', 'response', 'identity-mismatch', 'client-disconnected'].includes(row.type))) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return rows
  } finally {
    gateway.closeAllConnections(); upstream.closeAllConnections()
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => upstream.close(resolve))])
    rmSync(dir, { recursive: true, force: true })
  }
}
const types = async mode => (await exerciseTransport(mode)).map(row => row.type).filter(type => !['request-forwarded', 'upstream-headers', 'upstream-first-byte', 'transport-end'].includes(type))
assert.deepEqual(await types('cancel'), ['request', 'client-disconnected'], 'client cancellation must not be attributed to an upstream failure')
assert.deepEqual(await types('reset'), ['request', 'upstream-error'], 'a real upstream reset remains an upstream failure')
assert.deepEqual(await types('partial'), ['request', 'upstream-response-error'], 'an interrupted upstream body must not be relabelled as client cancellation')
assert.deepEqual(await types('answer'), ['request', 'response'], 'a completed response must not be marked cancelled')
assert.deepEqual(await types('identity'), ['request', 'identity-mismatch'], 'gateway identity rejection must not be attributed to client cancellation')
for (const mode of ['cancel', 'cancel-headers', 'cancel-body', 'answer', 'reset', 'partial', 'identity']) {
  const rows = await exerciseTransport(mode)
  const terminals = rows.filter(row => row.type === 'transport-end')
  assert.equal(terminals.length, 1, `${mode} must have exactly one transport terminal`)
  const end = terminals[0]
  assert.equal(end.outcome, mode.startsWith('cancel') ? 'client-disconnected' : mode === 'answer' ? 'completed' : mode === 'reset' ? 'upstream-error' : mode === 'partial' ? 'upstream-response-error' : 'identity-rejected')
  assert.equal(end.headersMs === null, mode === 'cancel' || mode === 'reset')
  assert.equal(end.firstByteMs === null, mode === 'cancel' || mode === 'cancel-headers' || mode === 'reset')
  assert.equal(end.receivedBytes > 0, ['cancel-body', 'answer', 'partial', 'identity'].includes(mode))
  assert.ok(end.elapsedMs >= 0)
  const request = rows.find(row => row.type === 'request')
  assert.match(request.bodySHA256, /^[a-f0-9]{64}$/)
  assert.ok(request.bodyBytes > 0)
  assert.equal(JSON.stringify(rows).includes('synthetic offline fixture'), false, 'transport metadata must not copy prompt contents')
}
console.log('SWE Pro gateway self-tests passed')
