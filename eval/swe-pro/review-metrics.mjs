// These are observed review events, never inferred gains or correctness verdicts.
const dimensions = ['requirement-plan', 'plan-implementation', 'architecture', 'direction', 'exploration', 'verification', 'recovery']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const readReviewInputs = debug => {
  const heads = [], parts = [], inputs = []
  let malformedEvents = 0, incompleteInputs = 0
  const key = e => `${e.id}\n${e.promptSignature}`
  for (const line of debug.split('\n')) {
    const at = line.indexOf('deepseek-supervisor: ')
    if (at < 0) continue
    const match = /^(REVIEW_INPUT|REVIEW_INPUT_PART) (.*)$/.exec(line.slice(at + 'deepseek-supervisor: '.length))
    if (!match) continue
    try {
      if (match[2].length > 131072) throw Error('input record limit')
      const e = JSON.parse(match[2])
      if (!object(e) || typeof e.id !== 'string' || !/^[^\r\n]{1,128}$/.test(e.id) || typeof e.promptSignature !== 'string' || !/^[^\r\n]{1,128}$/.test(e.promptSignature)) throw Error('invalid input record')
      ;(match[1] === 'REVIEW_INPUT' ? heads : parts).push(e)
    } catch { malformedEvents++ }
  }
  for (const head of heads) {
    if (head.status !== 'prepared') { incompleteInputs++; continue }
    if (object(head.context) && Array.isArray(head.context.sources)) { inputs.push(head); continue }
    const group = parts.filter(p => key(p) === key(head))
    if (head.contextEncoding !== 'json-parts' || !Number.isSafeInteger(head.parts) || head.parts < 1 || head.parts > 128 || !Number.isSafeInteger(head.characters) || head.characters < 1 || head.characters > 131072 || group.length !== head.parts || new Set(group.map(p => p.index)).size !== head.parts || group.some(p => p.total !== head.parts || !Number.isSafeInteger(p.index) || p.index < 0 || p.index >= head.parts || typeof p.text !== 'string' || p.text.length > 2000)) { incompleteInputs++; continue }
    try {
      const text = group.toSorted((a, b) => a.index - b.index).map(p => p.text).join('')
      if (text.length !== head.characters) throw Error('incomplete input')
      const e = JSON.parse(text)
      if (!object(e) || key(e) !== key(head) || e.modelId !== head.modelId || e.status !== 'prepared' || !object(e.context) || !Array.isArray(e.context.sources)) throw Error('input metadata mismatch')
      inputs.push(e)
    } catch { incompleteInputs++ }
  }
  const headKeys = new Set(heads.map(key))
  return { inputs, incompleteInputs, malformedEvents, orphanPartGroups: new Set(parts.filter(p => !headKeys.has(key(p))).map(key)).size }
}
export const reviewMetrics = debug => {
  const parse = marker => [...debug.matchAll(new RegExp(`deepseek-supervisor: ${marker} (\\{[^\\n]+\\})`, 'g'))].flatMap(m => { try { const v = JSON.parse(m[1]); return v && typeof v === 'object' && !Array.isArray(v) ? [v] : [] } catch { return [] } })
  const reviews = parse('REVIEW'), deliveries = parse('REVIEW_DELIVERY')
  const inputs = readReviewInputs(debug)
  return {
    inputAudit: { prepared: inputs.inputs.length, incompleteInputs: inputs.incompleteInputs, malformedEvents: inputs.malformedEvents, orphanPartGroups: inputs.orphanPartGroups },
    factsReturned: parse('ASSIST').filter(e => e.delivery === 'context-returned' && e.packet?.kind === 'location').length,
    sourceFactCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).reduce((n, d) => n + (Number.isSafeInteger(d.sourceFactCount) && d.sourceFactCount > 0 && d.sourceFactCount <= 6 ? d.sourceFactCount : 0), 0),
    reviews, deliveries, deliveryCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).length,
    dimensions: Object.fromEntries(dimensions.map(d => [d, { reviewed: reviews.filter(r => r.reviewed?.includes(d)).length, judgments: reviews.filter(r => r.dimension === d).length, unreviewed: reviews.filter(r => r.unreviewed?.includes(d)).length }])),
    actions: Object.fromEntries(['none', 'location', 'probe', 'recovery'].map(action => [action, reviews.filter(r => r.action === action).length])),
    mainActionChanged: 'unknown', adviceCorrect: 'unknown', validatedBenefit: 'unknown',
    interpretation: 'Review and return counts describe process behavior. Audit actual model-visible feedback, subsequent actions, incorrect advice and independent official acceptance separately. Missing or repeated source is not a new benefit.',
  }
}
