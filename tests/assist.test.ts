import { test, expect } from 'claude-code/testing'
import { buildAssistPacket, buildLocalAssistPacket, parseFactRequest, assistSignal, assistNote, localFactRequest } from '../supervisor/assist'
import type { AssistInput, FactView } from '../supervisor/contracts'
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'w', snapshotId: 'unknown' }
const input: AssistInput = { binding, asked: 'Fix parseDate used by app.cjs.', symptom: 'candidate util.cjs; caller missing', recentFacts: [] }
const view: FactView = { facts: [{ id: 'f1', path: 'app.cjs', startLine: 1, quote: 'exports.day = require("./utils.cjs").parseDate', fileHash: 'a'.repeat(64) }], files: [{ path: 'app.cjs', fileHash: 'a'.repeat(64) }], manifestHash: 'b'.repeat(64), incomplete: false }
const packet = { kind: 'location', question: 'Which implementation does app load?', requirementQuote: 'Fix parseDate', factIds: ['f1'], observationIds: [], explanation: 'The imported implementation may differ from the selected one.', nextCheck: 'Read the imported file.', requiresMainJudgment: true }

test('explicit source names ground a file-only search for the observed missing identifier', async () => {
  const symptom = 'Observed candidate util.cjs defines parseDate; no related actual caller/import or API contract is present. Check whether additional source facts are needed.'
  expect(localFactRequest('Fix parseDate used by app.cjs.', symptom)).toEqual({ paths: [], terms: ['parseDate'], searchPaths: ['util.cjs', 'app.cjs'] })
  expect(localFactRequest('Fix parseDate in `src/app.ts`; preserve `src/app.ts`.', symptom)).toEqual({ paths: [], terms: ['parseDate'], searchPaths: ['util.cjs', 'src/app.ts'] })
  expect(localFactRequest('Fix parseDate.', symptom)).toBeNull()
  expect(localFactRequest('Fix parseDate in util.cjs.', symptom)).toBeNull()
  expect(localFactRequest('Fix parseDate used by app.cjs.', 'Observed call/API error: TypeError: parseDate is not a function')).toBeNull()
})
test('local scope does not repair unsafe source names or silently drop excess paths', async () => {
  const symptom = 'Observed candidate util.cjs defines parseDate; no related actual caller/import or API contract is present. Check whether additional source facts are needed.'
  for (const path of ['../app.cjs', '/app.cjs', 'src/../../app.cjs', '.env/app.cjs', 'dir\\app.cjs']) expect(localFactRequest(`Fix parseDate used by ${path}.`, symptom)).toBeNull()
  expect(localFactRequest('Fix parseDate in a.cjs b.cjs c.cjs d.cjs e.cjs f.cjs.', symptom)).toBeNull()
})
test('local source paths retain complete filename tokens and reject unsupported suffixes', async () => {
  const symptom = 'Observed candidate util.cjs defines parseDate; no related actual caller/import or API contract is present. Check whether additional source facts are needed.'
  for (const path of ['src/app.js.map', 'cli.js.pem', 'app.js/../../secrets', '`app.js`.pem', '`app.js.`']) expect(localFactRequest(`Fix parseDate used by ${path}`, symptom)).toBeNull()
  expect(localFactRequest('Fix parseDate used by `foo+bar.ts`.', symptom)?.searchPaths).toEqual(['util.cjs', 'foo+bar.ts'])
})
test('oversized requirements do not enter local scope extraction', async () => {
  const symptom = 'Observed candidate util.cjs defines parseDate; no related actual caller/import or API contract is present. Check whether additional source facts are needed.'
  expect(localFactRequest('Fix parseDate used by app.cjs. ' + 'x'.repeat(65536), symptom)).toBeNull()
})

test('a location packet presents the real import verbatim and keeps explanation a hypothesis', async () => {
  const p = buildAssistPacket(input, view, JSON.stringify(packet))
  expect(p?.binding).toEqual(binding)
  expect(assistNote(p!, view)).toContain('app.cjs:1')
  expect(assistNote(p!, view)).toContain(view.facts[0]!.quote)
  expect(assistNote(p!, view)).toContain('Unverified explanation')
})
test('a local side reply selects grounded call facts without generating a repair explanation', async () => {
  const scoped = { ...view, searchScope: { paths: ['app.cjs'], terms: ['parseDate'] } }
  const p = buildLocalAssistPacket(input, scoped, '{"factIds":["f1"]}')
  expect(p?.factIds).toEqual(['f1'])
  expect(p?.requirementQuote).toBe(input.asked)
  expect(p?.requiresMainJudgment).toBe(true)
  expect(assistNote(p!, scoped)).toContain(view.facts[0]!.quote)
  expect(assistNote(p!, scoped)).toContain('remain unverified')
  for (const text of ['null', '{"factIds":[]}', '{"factIds":["invented"]}', '{"factIds":["f1"],"explanation":"apply my fix"}']) expect(buildLocalAssistPacket(input, scoped, text)).toBeNull()
  expect(buildLocalAssistPacket(input, { ...scoped, incomplete: true }, '{"factIds":["f1"]}')).toBeNull()
  expect(buildLocalAssistPacket(input, { ...scoped, facts: [{ ...view.facts[0]!, quote: 'exports.parseDate = s => s' }] }, '{"factIds":["f1"]}')).toBeNull()
})
test('local packet requirements retain the actual matching line and never fabricate an abbreviated quote', async () => {
  const scoped = { ...view, searchScope: { paths: ['app.cjs'], terms: ['parseDate'] } }
  const long = { ...input, asked: 'x'.repeat(3000) + '\nFix parseDate in app.cjs.' }
  expect(buildLocalAssistPacket(long, scoped, '{"factIds":["f1"]}')?.requirementQuote).toBe('Fix parseDate in app.cjs.')
  expect(buildLocalAssistPacket({ ...input, asked: 'Fix client in app.cjs.' }, scoped, '{"factIds":["f1"]}')).toBeNull()
  expect(buildLocalAssistPacket(input, view, '{"factIds":["f1"]}')).toBeNull()
})
test('an observed bare call is valid source evidence while a definition alone is not', async () => {
  for (const quote of ['dispatch(retry(newRetry(currentRetry, queryParameters, error)));', 'const day = parseDate(input)', 'return parseDate(input)']) {
    const source = { ...view, facts: [{ ...view.facts[0]!, quote }] }
    expect(buildAssistPacket(input, source, JSON.stringify(packet))?.factIds).toEqual(['f1'])
  }
  for (const quote of ['function parseDate(input) {', 'def parseDate(input):', 'const parseDate = input => input', '// parseDate(input)', '"parseDate(input)"', 'if (ready) {']) expect(buildAssistPacket(input, { ...view, facts: [{ ...view.facts[0]!, quote }] }, JSON.stringify(packet))).toBeNull()
})
test('short local reply IDs resolve only to the original bound source facts', async () => {
  const scoped = { ...view, facts: [{ ...view.facts[0]!, id: 'c'.repeat(64) }], searchScope: { paths: ['app.cjs'], terms: ['parseDate'] } }
  expect(buildLocalAssistPacket(input, scoped, '{"factIds":["f1"]}')?.factIds).toEqual(['c'.repeat(64)])
  for (const id of ['f0', 'f2', 'f01', 'f-1', 'c'.repeat(64)]) expect(buildLocalAssistPacket(input, scoped, JSON.stringify({ factIds: [id] }))).toBeNull()
})
test('fabricated references, quotes, requirements and incomplete views cannot become feedback', async () => {
  for (const p of [{ ...packet, factIds: ['made-up'] }, { ...packet, requirementQuote: 'return 0' }, { ...packet, quote: 'invented import' }, { ...packet, observationIds: ['unseen'] }, { ...packet, requiresMainJudgment: false }]) expect(buildAssistPacket(input, view, JSON.stringify(p))).toBeNull()
  expect(buildAssistPacket(input, { ...view, incomplete: true }, JSON.stringify(packet))).toBeNull()
  expect(buildAssistPacket(input, view, 'null')).toBeNull()
})
test('dynamic expressions and generator sources are preserved without guessing their targets', async () => {
  for (const quote of ['require("./" + name).round(x)', 'fs.writeFileSync("generated.cjs", require("./config.json").currency)']) {
    const v = { ...view, facts: [{ ...view.facts[0]!, quote }] }
    const p = buildAssistPacket(input, v, JSON.stringify(packet))!
    expect(assistNote(p, v)).toContain(quote)
  }
})
test('fact requests are bounded literal searches and reject unsafe paths', async () => {
  expect(parseFactRequest('{"paths":["app.cjs"],"terms":["parseDate"]}')).toEqual({ paths: ['app.cjs'], terms: ['parseDate'] })
  for (const paths of [['../x'], ['/tmp/x'], ['.env'], ['x/../app.cjs'], ['dir\\app.cjs'], Array(7).fill('app.cjs')]) expect(parseFactRequest(JSON.stringify({ paths, terms: [] }))).toBeNull()
  expect(parseFactRequest('{"paths":[],"terms":["a","b","c"]}')).toBeNull()
  expect(parseFactRequest('{"paths":[],"terms":[]}')).toBeNull()
})
test('local search scopes remain explicit and reject unsafe or meaningless ranges', async () => {
  const request = { paths: [], terms: ['parseDate'], searchPaths: ['src/date', 'src/date'] }
  expect(parseFactRequest(JSON.stringify(request))).toEqual({ paths: [], terms: ['parseDate'], searchPaths: ['src/date'] })
  for (const searchPaths of [['../x'], ['/etc'], ['.env'], ['dir/../x'], [], Array(7).fill('src')]) expect(parseFactRequest(JSON.stringify({ ...request, searchPaths }))).toBeNull()
  expect(parseFactRequest(JSON.stringify({ ...request, terms: [] }))).toBeNull()
})
test('local search feedback exposes scope and never implies repository-wide absence', async () => {
  const scoped = { ...view, searchScope: { paths: ['app.cjs'], terms: ['parseDate'] } }
  const p = buildAssistPacket(input, scoped, JSON.stringify(packet))!
  expect(assistNote(p, scoped)).toContain('app.cjs')
  expect(assistNote(p, scoped)).toContain('outside this search scope remains unknown')
  for (const paths of [['../x'], ['.env'], []]) expect(buildAssistPacket(input, { ...scoped, searchScope: { ...scoped.searchScope, paths } }, JSON.stringify(packet))).toBeNull()
})
test('observable candidate without call context or API errors trigger; simple reads and known imports do not', async () => {
  const read = (text: string) => [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/util.cjs' }, text }] }]
  expect(assistSignal(input.asked, read('exports.parseDate = s => Number(s.slice(-2))'), '/p')).not.toBeNull()
  expect(assistSignal(input.asked, read('exports.day = require("./utils.cjs").parseDate'), '/p')).toBeNull()
  expect(assistSignal('Fix label typo.', read('exports.label = "Welcom"'), '/p')).toBeNull()
  expect(assistSignal(input.asked, [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'node test.cjs' }, text: 'TypeError: hasKey is not a function' }] }], '/p')).not.toBeNull()
})

test('a label typo with a preserved count function does not create a location job', async () => {
  expect(assistSignal('Fix the label typo Welcom to Welcome. Preserve the count function.', [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/app.cjs' }, text: 'exports.label = "Welcom"; exports.count = xs => xs.length' }] }], '/p')).toBeNull()
})

test('an identifier appearing only inside a different word cannot spend the one facts job', async () => {
  const rows = [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/buildSrc/nativeLibraryProvider.js' }, text: 'const cli = value => value' }] }]
  expect(assistSignal('Move entropy from the client to src/api/worker/facades/EntropyFacade.ts.', rows, '/p')).toBeNull()
  expect(assistSignal('Fix cli used by app.cjs.', rows, '/p')).not.toBeNull()
})
test('an actual caller already returned in the current tool batch is not missing evidence', async () => {
  const rows = [{ role: 'assistant', text: '', toolUses: [
    { tool: 'Read', input: { file_path: '/p/app.cjs' }, text: '38\t                dispatch(parseDate(input));' },
    { tool: 'Read', input: { file_path: '/p/util.cjs' }, text: '36\texports.parseDate = input => input' },
  ] }]
  expect(assistSignal(input.asked, rows, '/p')).toBeNull()
  const quotesOnly = [{ ...rows[0]!, toolUses: [{ ...rows[0]!.toolUses[0]!, text: 'const note = "parseDate(input)"' }, rows[0]!.toolUses[1]!] }]
  expect(assistSignal(input.asked, quotesOnly, '/p')).not.toBeNull()
  for (const caller of [
    { ...rows[0]!.toolUses[0]!, input: { file_path: '/elsewhere/app.cjs' } },
    { ...rows[0]!.toolUses[0]!, isError: true as const },
    { ...rows[0]!.toolUses[0]!, text: 'dispatch("parseDate(input)")' },
  ]) expect(assistSignal(input.asked, [{ ...rows[0]!, toolUses: [caller, rows[0]!.toolUses[1]!] }], '/p')).not.toBeNull()
})

test('definition-only location advice cannot stand in for an actual import or call source', async () => {
  const v = { ...view, facts: [{ ...view.facts[0]!, quote: 'exports.parseDate = s => Number(s.slice(-2))' }] }
  expect(buildAssistPacket(input, v, JSON.stringify(packet))).toBeNull()
})

test('unrelated imports and other batch reads do not conceal a candidate or call error', async () => {
  const candidate = { tool: 'Read', input: { file_path: '/p/util.cjs' }, text: 'exports.parseDate = s => Number(s.slice(-2))' }
  const rows = (toolUses: { tool: string; input: unknown; text: string }[]) => [{ role: 'assistant', text: '', toolUses }]
  expect(assistSignal(input.asked, rows([{ ...candidate, text: 'const fs = require("node:fs")\n' + candidate.text }]), '/p')).not.toBeNull()
  expect(assistSignal(input.asked, rows([candidate, { tool: 'Read', input: { file_path: '/p/package.json' }, text: '{"name":"fixture"}' }]), '/p')).not.toBeNull()
  expect(assistSignal(input.asked, rows([{ tool: 'Bash', input: { command: 'node test.cjs' }, text: 'TypeError: parseDate is not a function' }, { tool: 'Read', input: { file_path: '/p/package.json' }, text: '{}' }]), '/p')).not.toBeNull()
})

test('user tool-result rows cannot hide an observed candidate or API error', async () => {
  const asked = 'Fix parseDate used by app.cjs.'
  const candidate = { role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/p/util.cjs' }, text: 'exports.parseDate = s => Number(s.slice(-2))' }] }
  const toolResult = { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'read', text: 'source excerpt' }] }
  expect(assistSignal(asked, [{ role: 'user', text: asked, toolUses: [] }, candidate, toolResult], '/p')).not.toBeNull()
  expect(assistSignal(asked, [{ role: 'user', text: asked, toolUses: [] }, { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'node test.cjs' }, text: 'TypeError: parseDate is not a function' }] }, toolResult], '/p')).not.toBeNull()
  expect(assistSignal(asked, [{ role: 'user', text: asked, toolUses: [] }, candidate, toolResult, { role: 'user', text: 'A new unrelated task.', toolUses: [] }], '/p')).toBeNull()
})
