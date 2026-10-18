import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { readReviewInputs, readReviews, reviewMetrics } from './swe-pro/review-metrics.mjs'

// Execute the actual pure production modules, without a host, network or model.
// Transpilation is confined to a fresh temporary directory; source is untouched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'review-public-replay-'))
const binding = { sessionId: 'replay', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'recorded', snapshotId: 'unknown' }
try {
  for (const file of ['hooks/prompt', 'hooks/evidence', 'supervisor/assist', 'supervisor/review', 'supervisor/incremental', 'supervisor/coordinator']) {
    const output = ts.transpileModule(readFileSync(join(root, file + '.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (_all, quote, path) => `from ${quote}${path}.mjs${quote}`)
    mkdirSync(dirname(join(temp, file)), { recursive: true }); writeFileSync(join(temp, file + '.mjs'), output)
  }
  const { IncrementalReview } = await import(pathToFileURL(join(temp, 'supervisor/incremental.mjs')))
  const { buildIncrementalContext, incrementalLastTool, parseReview, reviewInputLogs, reviewEventLogs, reviewPrompt } = await import(pathToFileURL(join(temp, 'supervisor/review.mjs')))
  const { evidenceOf, reviewChangesOf } = await import(pathToFileURL(join(temp, 'hooks/evidence.mjs')))
  const { Coordinator } = await import(pathToFileURL(join(temp, 'supervisor/coordinator.mjs')))
  const { redact } = await import(pathToFileURL(join(temp, 'hooks/prompt.mjs')))
  const corpus = JSON.parse(readFileSync(join(root, 'eval/data/review-replay-v1/cases.json')))
  const cases = Object.fromEntries(corpus.cases.map(c => [c.name, c.publicData]))
  let availableSourceHashes = 0
  for (const c of corpus.cases) for (const source of c.sources) if (existsSync(join(root, source.artifact))) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, source.artifact))).digest('hex'), source.sha256)
    availableSourceHashes++
  }
  const context = opportunity => buildIncrementalContext(binding, 'Preserve the public API and verify the requested behavior.', opportunity, '', 'exploration')
  const checked = []
  {
    const fixture = JSON.parse(readFileSync(join(root, 'eval/data/review-replay-v1/long-report.json')))
    if (existsSync(join(root, fixture.source.artifact))) {
      assert.equal(createHash('sha256').update(readFileSync(join(root, fixture.source.artifact))).digest('hex'), fixture.source.sha256)
      availableSourceHashes++
    }
    const event = { ...fixture.event, binding: { ...fixture.event.binding, sessionId: 'private-replay-identity' } }
    const lines = reviewEventLogs(event).map(line => `deepseek-supervisor: ${line}`)
    assert.ok(lines.every(line => line.length < 10000), 'serialized diagnostics must fit before the actual native logging boundary')
    const throughNativeLimit = lines.map(line => line.length > 10000 ? line.slice(0, 10000) + '…' : line).toReversed().join('\n')
    const reconstructed = readReviews(throughNativeLimit)
    assert.equal(reconstructed.reviews.length, 1)
    assert.equal(reconstructed.reviews[0].report, fixture.event.report)
    assert.equal(reconstructed.reviews[0].binding.sessionId, undefined)
    assert.equal(reconstructed.alteredReviews.length, 0)
    assert.equal(reconstructed.incompleteRecords, 0)
    assert.equal(throughNativeLimit.includes('private-replay-identity'), false)
    const escaped = reviewEventLogs({ ...event, report: ('\n\t\"\\' + String.fromCharCode(1)).repeat(1800) })
    assert.ok(escaped.every(line => line.length < 10000), 'JSON escaping must not overflow a plain-text part')
    const short = readReviews(reviewEventLogs({ id: 'short', binding, report: 'short public advice' }).map(line => `deepseek-supervisor: ${line}`).join('\n'))
    assert.equal(short.reviews[0].report, 'short public advice')
    checked.push('historical-long-report-native-log-boundary')
  }

  for (const row of cases['prefixed-real-technical-intents'].texts) {
    const r = new IncrementalReview(1); r.step(row.time, row.text)
    assert.ok(context(r.take()).sources.some(s => s.kind === 'narrative' && s.text === row.text))
  }
  checked.push('prefixed-real-technical-intents')
  {
    const r = new IncrementalReview(3); r.step('1', cases['search-fallback-not-exclusive-stage'].text)
    assert.equal(r.take(), null); r.step('2', ''); r.step('3', '')
    const c = context(r.take()); assert.equal(c.sources.some(s => s.kind === 'plan'), false)
    assert.ok(c.sources.some(s => s.text === cases['search-fallback-not-exclusive-stage'].text))
  }
  checked.push('search-fallback-not-exclusive-stage')
  {
    const r = new IncrementalReview(5), data = cases['technical-text-before-first-edit']
    for (const row of data.texts) r.add(row.time, 'narrative', row.text)
    r.add('proposed', 'proposed-change', JSON.stringify(data.firstEditToolEmission)); r.request('first-write')
    r.step('later', JSON.stringify(data.laterIntent))
    const p = r.take(); assert.deepEqual(p.reasons, ['first-write'])
    for (const row of data.texts) assert.ok(p.sources.some(s => s.text === row.text))
    assert.equal(context(p).sources.some(s => s.kind === 'change'), false)
  }
  checked.push('technical-text-before-first-edit')
  {
    const c = new Coordinator(binding, { historical: true }); let submits = 0
    await c.deliver('recorded-queued-only', binding, async () => { submits++; return 'unknown' })
    await c.deliver('recorded-queued-only', binding, async () => { submits++; return 'delivered' })
    assert.equal(submits, 1); assert.equal(cases['queued-without-next-request'].mainRequestsWithFeedback, 0)
    assert.equal(reviewMetrics('deepseek-supervisor: REVIEW_QUEUED {"id":"recorded-queued-only"}').deliveryCount, 0)
  }
  checked.push('queued-without-next-request')
  {
    const r = new IncrementalReview(1); r.step('1', 'Recorded public material.')
    const c = context(r.take()), report = cases['natural-multiple-concerns'].report
    assert.equal(parseReview(c, report, true).report, report)
    assert.deepEqual(parseReview(c, report, true).reviewed, [])
  }
  checked.push('natural-multiple-concerns')
  {
    // Actual private source bytes are intentionally absent. The recorded 36/2/34
    // shape drives synthetic privacy controls, not an assertion about those bytes.
    const data = cases['mixed-private-and-safe-material']
    const uses = Array.from({ length: data.totalChangeRecords }, (_, i) => ({ tool: 'Write', input: { file_path: `fixture-${i}.ts`, content: i < data.privacyAffectedRecords ? 'const password = "synthetic-private-control"' : `export const value${i} = ${i}` }, text: 'written' }))
    const material = reviewChangesOf(evidenceOf([{ role: 'assistant', text: '', toolUses: uses }]))
    assert.ok(material.omitted.includes('privacy-affected-changes'))
    assert.equal(material.text.includes('synthetic-private-control'), false)
    for (let i = data.privacyAffectedRecords; i < data.totalChangeRecords; i++) assert.ok(material.text.includes(`value${i}`))
  }
  checked.push('mixed-private-and-safe-material: recorded-counts/synthetic-private-controls')
  {
    const r = new IncrementalReview(5), data = cases['scaffold-failure-vs-project-failure']
    const text = JSON.stringify(data.observation); r.add('failed', 'observation', text); r.request('failure')
    const c = context(r.take()); assert.ok(c.sources.some(s => s.text === text))
    assert.equal(parseReview(c, data.report, true).report, data.report)
    assert.equal(c.scope.repositoryComplete, false)
  }
  checked.push('scaffold-failure-vs-project-failure: fidelity/semantic-label-manual')
  {
    const data = cases['acknowledgment-after-self-correction']
    assert.ok(Date.parse(data.compatibleSearchAt) < Date.parse(data.firstMainFeedback))
    assert.ok(data.persistentRequestHits > 1)
    const metrics = reviewMetrics('deepseek-supervisor: REVIEW_DELIVERY {"id":"one-report","delivery":"context-returned","consumption":"unknown"}')
    assert.equal(metrics.deliveryCount, 1); assert.equal(metrics.validatedBenefit, 'unknown'); assert.equal(metrics.mainActionChanged, 'unknown')
  }
  checked.push('acknowledgment-after-self-correction: timing/no-causal-certificate')
  {
    const c = context((() => { const r = new IncrementalReview(1); r.step('1', 'Keep PUBLIC source text unchanged.'); return r.take() })())
    const logs = reviewInputLogs({ kind: 'engineering-review-input', id: 'framing-case', status: 'prepared', modelId: 'fixture', promptSignature: 'fixed', context: c }).map(l => 'deepseek-supervisor: ' + l)
    const clean = readReviewInputs(logs.join('\n'))
    assert.equal(clean.inputs.length, 1)
    const changed = readReviewInputs(logs.map(l => l.replace('PUBLIC', 'public')).join('\n'))
    assert.equal(changed.inputs.length, 0, 'equal-length native log edits must not authenticate an original diagnostic')
    assert.equal(changed.alteredInputs.length, 1)
    const missing = readReviewInputs(logs.filter(l => !l.includes('REVIEW_INPUT_PART ')).join('\n'))
    assert.equal(missing.inputs.length, 0)
    assert.equal(missing.alteredInputs.length, 0, 'missing parts cannot become an altered-but-complete input')
  }
  checked.push('diagnostic-host-alteration: fidelity-not-missing-parts')
  {
    const data = cases['completion-code-and-counterevidence'], r = new IncrementalReview(5)
    const baseline = JSON.stringify(data.priorBaselineObservation)
    r.add('prior-baseline', 'observation', baseline)
    for (const source of data.completionSources) r.add(source.id, source.kind, source.text)
    r.request('completion')
    // Retain original safe file excerpts independently; privacy filtering is not
    // rewriting code. These files were unchanged after the original checkpoint.
    const chunks = data.unchangedPreCompletionFileDiffs.split('diff --git ').slice(1).map(part => 'diff --git ' + part)
    const safe = chunks.filter(text => redact(text) === text)
    const c = buildIncrementalContext(binding, data.requirement, r.take(), safe.join(''), 'completion', safe.length !== chunks.length ? ['privacy-affected-changes'] : [])
    assert.ok(c.sources.some(s => s.kind === 'change' && s.text.includes('pendingActions')))
    assert.ok(c.sources.some(s => s.kind === 'observation' && s.text === baseline))
    const answer = data.completionSources.find(s => s.kind === 'answer').text
    assert.equal(c.sources.filter(s => s.text === answer).length, 1)
    assert.equal(c.sources.find(s => s.text === answer).kind, 'answer')
    assert.ok(Buffer.byteLength(JSON.stringify(c)) <= 49152)
    assert.equal(parseReview(c, 'Coverage remains uncertain: test success alone is not an exact timing or intermediate-state oracle.', true).judgment, null)
    const prompt = reviewPrompt(c, 'supervise')
    assert.ok(prompt.endsWith(JSON.stringify(c)), 'all actual oracles/code/counterevidence reach the same reviewer input')
    const latestTool = incrementalLastTool(c, '/app')
    assert.equal(latestTool.toolUseId, 'call_3f170e44b280413097477c9a')
    assert.equal(latestTool.tool, 'Bash')
    // Synthetic budget pressure on original public file excerpts, not a claim
    // that this sequence occurred in the historical model session.
    const excerpts = safe.slice(0, 2).map((chunk, index) => ({ tool: 'Edit', input: { file_path: `/app/historical-${index}.tsx`, old_string: '', new_string: chunk.slice(0, 800) }, text: 'recorded' }))
    const pressure = Array.from({ length: 6 }, () => ({ tool: 'Edit', input: { file_path: '/app/historical-0.tsx', old_string: '', new_string: safe[0].slice(0, 1000) }, text: 'recorded' }))
    const selected = reviewChangesOf(evidenceOf([{ role: 'user', text: data.requirement }, { role: 'assistant', text: '', toolUses: [...pressure, ...excerpts] }]), 2000)
    assert.ok(selected.text.includes('+ ' + excerpts[0].input.new_string.split('\n')[0]))
    assert.ok(selected.text.includes('+ ' + excerpts[1].input.new_string.split('\n')[0]))
    assert.equal(selected.text.split('--- /app/historical-0.tsx').length - 1, 1)
    assert.ok(selected.omitted.includes('change-record-budget'))
    assert.ok(Buffer.byteLength(selected.text) <= 2000)
    // Real legacy diagnostic parts stay frozen. The new reader can distinguish
    // their observed host alteration without authenticating changed source text.
    const debugPath = join(root, 'eval/results/incremental-review-flash/pilot-001/run/instance_protonmail__webclients-e65cc5f33719e02e1c378146fb981d27bc24bdf4/facts/agent/debug.log')
    if (existsSync(debugPath)) {
      const audited = readReviewInputs(readFileSync(debugPath, 'utf8'))
      assert.equal(audited.inputs.length, 2); assert.equal(audited.alteredInputs.length, 1); assert.equal(audited.incompleteInputs, 0)
      assert.equal(audited.alteredInputs[0].id, 'review-193')
      assert.equal(audited.alteredInputs[0].exactPreparedInput, false)
    }
  }
  checked.push('completion-code-and-counterevidence: actual-inputs/semantic-oracle-labels-manual')
  checked.push('historical-included-tool-identity', 'historical-excerpts-with-synthetic-budget-pressure')
  const traceFlag = process.argv.indexOf('--trace'), sweep = []
  if (traceFlag >= 0) {
    const trace = JSON.parse(readFileSync(process.argv[traceFlag + 1]))
    for (const n of [3, 5, 8]) {
      const candidates = trace.streams.reduce((sum, stream) => sum + Math.floor(stream.events.filter(e => e.kind === 'model-response-end').length / n), 0)
      sweep.push({ interval: n, periodicTimingUpperBound: candidates, meaning: 'timing-only candidates before novelty, critical events, coalescing and budgets; not calls, cost or quality' })
    }
  }
  console.log(JSON.stringify({ kind: 'free-production-public-record-replay', cases: checked, availableSourceHashes, paidCalls: 0, projectCommands: 0, semanticQualityCertified: false, sweep }, null, 2))
} finally { rmSync(temp, { recursive: true, force: true }) }
