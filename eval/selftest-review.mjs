import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { freezeRuntime, assertRuntimeModes } from './swe-pro/agent.mjs'
import { validateResult } from './swe-pro/run-state.mjs'
import { reviewMetrics } from './swe-pro/review-metrics.mjs'
import { validateExperiment } from './experiment.mjs'
const dir = mkdtempSync(join(tmpdir(), 'dss-review-eval-'))
try {
  const runtime = join(dir, 'runtime'); mkdirSync(runtime)
  writeFileSync(join(runtime, 'claude'), 'fixture binary, never executed')
  writeFileSync(join(runtime, 'node'), 'fixture node, never executed')
  const checksum = createHash('sha256').update(readFileSync(join(runtime, 'claude'))).digest('hex')
  writeFileSync(join(runtime, 'manifest.json'), JSON.stringify({ version: '2.1.295', platforms: { 'linux-x64': { checksum } } }))
  const identity = freezeRuntime(resolve('.'), runtime, { experimentalMode: 'supervise' })
  assert.deepEqual(identity.armModes, { existing: 'existing', facts: 'supervise' })
  assert.equal(JSON.parse(readFileSync(join(runtime, 'plugin-facts/.claude-plugin/plugin.json'))).userConfig.assistance_mode.default, 'supervise')
  assertRuntimeModes(runtime, identity, 'supervise')
  assert.throws(() => assertRuntimeModes(runtime, identity, 'facts'), /mode/)
  const file = join(runtime, 'plugin-facts/.claude-plugin/plugin.json'), plugin = JSON.parse(readFileSync(file))
  plugin.userConfig.assistance_mode.default = 'facts'; writeFileSync(file, JSON.stringify(plugin))
  assert.throws(() => assertRuntimeModes(runtime, identity, 'supervise'), /mode/)
  const task = { instanceId: 'a' }, row = { task: 'a', mode: 'facts', experimentSHA256: 'hash', status: 'environment-error', functionalSuccess: null }
  assert.throws(() => validateResult(row, task, 'facts', 'hash', 'supervise'), /mode/)
  validateResult({ ...row, assistanceMode: 'supervise' }, task, 'facts', 'hash', 'supervise')
  assert.throws(() => validateResult({ ...row, assistanceMode: 'supervise', agent: { assistanceMode: 'facts' } }, task, 'facts', 'hash', 'supervise'), /mode/)
  const preview = spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--experimental-mode', 'supervise', '--dry-run'], { encoding: 'utf8' })
  assert.equal(preview.status, 0, preview.stderr)
  const jobs = JSON.parse(preview.stdout).jobs
  assert.ok(jobs.some(j => j.mode === 'facts' && j.assistanceMode === 'supervise'))
  assert.ok(jobs.every(j => j.assistanceMode === (j.mode === 'facts' ? 'supervise' : 'existing')))
  const short = spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--experimental-mode', 'supervise', '--task-timeout-ms', '900000', '--dry-run'], { encoding: 'utf8' })
  assert.equal(short.status, 0, short.stderr)
  assert.equal(JSON.parse(short.stdout).taskTimeoutMs, 900000)
  assert.notEqual(spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--task-timeout-ms', '0', '--dry-run']).status, 0)
  const invalid = spawnSync(process.execPath, ['eval/swe-pro/run.mjs', '--experimental-mode', 'bogus', '--dry-run'], { encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
  const dims = ['requirement-plan', 'plan-implementation', 'architecture', 'direction', 'exploration', 'verification', 'recovery']
  const log = dims.map(d => `deepseek-supervisor: REVIEW ${JSON.stringify({ phase: 'completion', mode: 'supervise', reviewed: [d], unreviewed: dims.filter(x => x !== d), dimension: d, recommendation: 'adjust', action: 'none', reason: 'prepared' })}`).join('\n')
  const metrics = reviewMetrics(log)
  assert.deepEqual(Object.keys(metrics.dimensions).sort(), dims.sort())
  assert.equal(metrics.reviews.length, 7)
  assert.equal(metrics.validatedBenefit, 'unknown', 'the presence of advice must not certify correctness or behavior improvement')
  assert.equal(reviewMetrics('deepseek-supervisor: ASSIST {\"delivery\":\"context-returned\",\"packet\":{\"kind\":\"location\"}}').factsReturned, 1)
  assert.equal(reviewMetrics('deepseek-supervisor: REVIEW_DELIVERY {\"delivery\":\"context-returned\",\"sourceFactCount\":2}').sourceFactCount, 2)
  assert.equal(metrics.mainActionChanged, 'unknown')
  assert.equal(reviewMetrics('deepseek-supervisor: REVIEW_DELIVERY {\"delivery\":\"context-returned\"}').factsReturned, 0, 'architecture advice is not a source fact packet')
  assert.equal(metrics.deliveryCount, 0, 'review completion alone cannot stand for delivery')
  assert.ok(readFileSync('eval/experiment.mjs', 'utf8').includes("'supervise'"))
  const reportEvent = { kind: 'engineering-review', id: 'long-report', report: 'all evidence survives', action: 'none' }
  const serializedReport = JSON.stringify(reportEvent)
  let reportHash = 2166136261
  for (let i = 0; i < serializedReport.length; i++) reportHash = Math.imul(reportHash ^ serializedReport.charCodeAt(i), 16777619)
  const reportChecksum = (reportHash >>> 0).toString(16)
  const reviewLine = (marker, value) => `deepseek-supervisor: ${marker} ${JSON.stringify(value)}`
  const reportHead = reviewLine('REVIEW', { id: reportEvent.id, eventEncoding: 'json-parts', parts: 2, characters: serializedReport.length, checksum: reportChecksum })
  const reportParts = [serializedReport.slice(0, 40), serializedReport.slice(40)].map((text, index) => reviewLine('REVIEW_PART', { id: reportEvent.id, checksum: reportChecksum, index, total: 2, text }))
  assert.equal(reviewMetrics([reportHead, ...reportParts.toReversed()].join('\n')).reviews[0]?.report, 'all evidence survives', 'reassemble diagnostic framing rather than counting the header as a report')
  for (const damaged of [
    [reportHead, reportParts[0]],
    [reportHead, ...reportParts, reportParts[0]],
    [reportHead, reportParts[0], reportParts[1].replace('"index":1', '"index":-1')],
    [reportHead, reportParts[0], reportParts[1].replace('"total":2', '"total":3')],
    [reportHead, reportHead, ...reportParts],
  ]) {
    const result = reviewMetrics(damaged.join('\n'))
    assert.equal(result.reviews.length, 0, 'damaged report parts are not a completed report')
    assert.ok(result.reportAudit.incompleteRecords > 0)
    assert.equal(result.deliveryCount, 0, 'diagnostic parts do not imply delivery')
  }
  const altered = reviewMetrics([reportHead, ...reportParts.map(l => l.replace('all evidence survives', 'all evidence altered!'))].join('\n'))
  assert.equal(altered.reviews.length, 0)
  assert.equal(altered.reportAudit.alteredRecords, 1, 'privacy-altered text must not be counted as exact')
  assert.equal(reviewMetrics(reportParts.join('\n')).reportAudit.orphanPartGroups, 1)
  assert.equal(reviewMetrics('deepseek-supervisor: REVIEW {"id":"broken","report":"…').reportAudit.malformedEvents, 1)
  const interleaved = reviewMetrics([reportHead, ...reportParts, reviewLine('REVIEW', { id: 'other', report: 'separate short review', action: 'none' })].toReversed().join('\n'))
  assert.equal(interleaved.reviews.length, 2)
  const ordered = reviewMetrics([reportHead, ...reportParts, reviewLine('REVIEW', { id: 'other', report: 'later short review' })].join('\n'))
  assert.deepEqual(ordered.reviews.map(v => v.id), ['long-report', 'other'], 'multipart reconstruction preserves original record order')
  assert.equal(interleaved.validatedBenefit, 'unknown')
  const prepared = { id: 'review-1', status: 'prepared', modelId: 'fixture', promptSignature: 'fixture-signature', context: { sources: [{ id: 'req', kind: 'requirement', text: 'Keep the public API.' }] } }
  const serializedInput = JSON.stringify(prepared), splitAt = 67
  const head = { id: prepared.id, status: 'prepared', modelId: 'fixture', promptSignature: prepared.promptSignature, contextEncoding: 'json-parts', parts: 2, characters: serializedInput.length }
  const eventLine = (marker, value) => `deepseek-supervisor: ${marker} ${JSON.stringify(value)}`
  const inputHead = eventLine('REVIEW_INPUT', head)
  const inputParts = [serializedInput.slice(0, splitAt), serializedInput.slice(splitAt)].map((text, index) => eventLine('REVIEW_INPUT_PART', { id: prepared.id, promptSignature: prepared.promptSignature, index, total: 2, text }))
  const reconstructed = reviewMetrics([inputHead, ...inputParts.toReversed()].join('\n'))
  assert.equal(reconstructed.inputAudit?.prepared, 1, 'complete correlated parts must recover the prepared input')
  assert.equal(reconstructed.inputAudit.incompleteInputs, 0)
  for (const damaged of [[inputHead, inputParts[0]], [inputHead, ...inputParts, inputParts[0]], [inputHead, inputParts[0], inputParts[1].replace('fixture-signature', 'other-signature')]]) {
    const inputAudit = reviewMetrics(damaged.join('\n')).inputAudit
    assert.equal(inputAudit.prepared, 0, 'missing, duplicated or mismatched parts must not fabricate a complete context')
    assert.equal(inputAudit.incompleteInputs, 1)
  }
  const clippedAudit = reviewMetrics('deepseek-supervisor: REVIEW_INPUT {"context":{"sources":[…').inputAudit
  assert.equal(clippedAudit.prepared, 0)
  assert.equal(clippedAudit.malformedEvents, 1, 'old clipped records stay explicitly unavailable')
  const { readReviewInputs } = await import('./swe-pro/review-metrics.mjs')
  assert.deepEqual(readReviewInputs([inputHead, ...inputParts].join('\n')).inputs, [prepared])
  assert.deepEqual(readReviewInputs(eventLine('REVIEW_INPUT', prepared)).inputs, [prepared], 'short legacy complete inputs remain readable')
  const normalized = { ...prepared, representation: 'session-id-omitted', omittedBindingFields: ['sessionId'], context: { ...prepared.context, binding: { generationId: 'g' } } }
  assert.equal(reviewMetrics(eventLine('REVIEW_INPUT', normalized)).inputAudit.sessionIdentityOmitted, 1, 'privacy-normalized input must be distinguishable from an exact session binding')
  const mislabeled = { ...normalized, context: { ...normalized.context, binding: { sessionId: 'must-not-be-logged' } } }
  assert.equal(readReviewInputs(eventLine('REVIEW_INPUT', mislabeled)).inputs.length, 0, 'claimed omission must not conceal a retained private identity')
  const hostAlteredParts = inputParts.map(line => line.replace('Keep the public API.', 'Keep the [REDACTED] API.'))
  const hostAltered = readReviewInputs([inputHead, ...hostAlteredParts].join('\n'))
  assert.equal(hostAltered.inputs.length, 0)
  assert.equal(hostAltered.incompleteInputs, 0, 'all correlated parts exist; changed content is not a missing-part failure')
  assert.equal(hostAltered.alteredInputs.length, 1, 'retain the normalized diagnostic separately without authenticating its source text')
  assert.ok(hostAltered.alteredInputs[0].context.sources[0].text.includes('[REDACTED]'))
  assert.equal(reviewMetrics([inputHead, ...hostAlteredParts].join('\n')).inputAudit.alteredInputs, 1)
  console.log('Comprehensive review identity/behavior metrics self-tests passed; fixture processes only, no model calls')
} finally { rmSync(dir, { recursive: true, force: true }) }
