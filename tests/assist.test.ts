import { test, expect } from 'claude-code/testing'
import { buildAssistPacket, parseFactRequest, assistSignal, assistNote } from '../supervisor/assist'
import type { AssistInput, FactView } from '../supervisor/contracts'
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'w', snapshotId: 'unknown' }
const input: AssistInput = { binding, asked: 'Fix parseDate used by app.cjs.', symptom: 'candidate util.cjs; caller missing', recentFacts: [] }
const view: FactView = { facts: [{ id: 'f1', path: 'app.cjs', startLine: 1, quote: 'exports.day = require("./utils.cjs").parseDate', fileHash: 'a'.repeat(64) }], files: [{ path: 'app.cjs', fileHash: 'a'.repeat(64) }], manifestHash: 'b'.repeat(64), incomplete: false }
const packet = { kind: 'location', question: 'Which implementation does app load?', requirementQuote: 'Fix parseDate', factIds: ['f1'], observationIds: [], explanation: 'The imported implementation may differ from the selected one.', nextCheck: 'Read the imported file.', requiresMainJudgment: true }

test('a location packet presents the real import verbatim and keeps explanation a hypothesis', async () => {
  const p = buildAssistPacket(input, view, JSON.stringify(packet))
  expect(p?.binding).toEqual(binding)
  expect(assistNote(p!, view)).toContain('app.cjs:1')
  expect(assistNote(p!, view)).toContain(view.facts[0]!.quote)
  expect(assistNote(p!, view)).toContain('Unverified explanation')
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

test('definition-only location advice cannot stand in for an actual import or call source', async () => {
  const v = { ...view, facts: [{ ...view.facts[0]!, quote: 'exports.parseDate = s => Number(s.slice(-2))' }] }
  expect(buildAssistPacket(input, v, JSON.stringify(packet))).toBeNull()
})
