// These are observed review events, never inferred gains or correctness verdicts.
const dimensions = ['requirement-plan', 'plan-implementation', 'architecture', 'direction', 'exploration', 'verification', 'recovery']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const logPrefix = /(?:code-supervisor|deepseek-supervisor): /
export const readReviewInputs = debug => {
  const heads = [], parts = [], inputs = [], alteredInputs = []
  let malformedEvents = 0, incompleteInputs = 0
  const key = e => `${e.id}\n${e.promptSignature}`
  const validPrivacy = e => e.representation === undefined && e.omittedBindingFields === undefined || e.representation === 'session-id-omitted' && Array.isArray(e.omittedBindingFields) && e.omittedBindingFields.length === 1 && e.omittedBindingFields[0] === 'sessionId' && object(e.context?.binding) && !Object.hasOwn(e.context.binding, 'sessionId')
  for (const line of debug.split('\n')) {
    const at = logPrefix.exec(line)
    if (!at) continue
    const match = /^(REVIEW_INPUT|REVIEW_INPUT_PART) (.*)$/.exec(line.slice(at.index + at[0].length))
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
    if (object(head.context) && Array.isArray(head.context.sources)) { if (validPrivacy(head)) inputs.push(head); else incompleteInputs++; continue }
    const group = parts.filter(p => key(p) === key(head))
    if (head.contextEncoding !== 'json-parts' || !Number.isSafeInteger(head.parts) || head.parts < 1 || head.parts > 128 || !Number.isSafeInteger(head.characters) || head.characters < 1 || head.characters > 131072 || group.length !== head.parts || new Set(group.map(p => p.index)).size !== head.parts || group.some(p => p.total !== head.parts || !Number.isSafeInteger(p.index) || p.index < 0 || p.index >= head.parts || typeof p.text !== 'string' || p.text.length > 2000)) { incompleteInputs++; continue }
    try {
      const text = group.toSorted((a, b) => a.index - b.index).map(p => p.text).join('')
      const e = JSON.parse(text)
      if (!object(e) || key(e) !== key(head) || e.modelId !== head.modelId || e.status !== 'prepared' || !object(e.context) || !Array.isArray(e.context.sources) || !validPrivacy(e) || e.representation !== head.representation || JSON.stringify(e.omittedBindingFields) !== JSON.stringify(head.omittedBindingFields)) throw Error('input metadata mismatch')
      let hash = 2166136261
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
      if (text.length !== head.characters || head.checksum !== undefined && head.checksum !== (hash >>> 0).toString(16)) {
        alteredInputs.push({ ...e, diagnosticFidelity: 'altered', declaredCharacters: head.characters, observedCharacters: text.length, exactPreparedInput: false })
      } else inputs.push(e)
    } catch { incompleteInputs++ }
  }
  const headKeys = new Set(heads.map(key))
  return { inputs, alteredInputs, incompleteInputs, malformedEvents, orphanPartGroups: new Set(parts.filter(p => !headKeys.has(key(p))).map(key)).size }
}
export const readReviews = debug => {
  const heads = [], parts = [], reviews = [], alteredReviews = []
  const order = new Map()
  let incompleteRecords = 0, malformedEvents = 0
  const key = e => `${e.id}\n${e.checksum}`
  const idValid = e => typeof e.id === 'string' && /^[^\r\n]{1,128}$/.test(e.id)
  for (const [lineIndex, line] of debug.split('\n').entries()) {
    const at = logPrefix.exec(line)
    if (!at) continue
    const m = /^(REVIEW|REVIEW_PART) (.*)$/.exec(line.slice(at.index + at[0].length))
    if (!m) continue
    try {
      if (m[2].length > 262144) throw Error('review record limit')
      const event = JSON.parse(m[2])
      if (!object(event)) throw Error('invalid review record')
      order.set(event, lineIndex)
      if (m[1] === 'REVIEW_PART') parts.push(event)
      else if (event.eventEncoding !== undefined) heads.push(event)
      else reviews.push(event)
    } catch { malformedEvents++ }
  }
  for (const head of heads) {
    const group = parts.filter(p => key(p) === key(head))
    if (!idValid(head) || head.eventEncoding !== 'json-parts' || !/^[0-9a-f]{1,8}$/.test(head.checksum ?? '') || !Number.isSafeInteger(head.characters) || head.characters < 1 || head.characters > 262144 || !Number.isSafeInteger(head.parts) || head.parts < 1 || head.parts > 256 || heads.filter(h => key(h) === key(head)).length !== 1 || group.length !== head.parts || new Set(group.map(p => p.index)).size !== head.parts || group.some(p => p.total !== head.parts || !Number.isSafeInteger(p.index) || p.index < 0 || p.index >= head.parts || typeof p.text !== 'string' || p.text.length > 2000)) { incompleteRecords++; continue }
    try {
      const text = group.toSorted((a, b) => a.index - b.index).map(p => p.text).join('')
      const event = JSON.parse(text)
      if (!object(event) || event.id !== head.id) throw Error('review identity mismatch')
      order.set(event, order.get(head))
      if (event.representation !== undefined && (event.representation !== 'session-id-omitted' || JSON.stringify(event.omittedBindingFields) !== '["sessionId"]' || !object(event.binding) || Object.hasOwn(event.binding, 'sessionId'))) throw Error('review privacy mismatch')
      let hash = 2166136261
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
      if (text.length !== head.characters || (hash >>> 0).toString(16) !== head.checksum) alteredReviews.push({ ...event, diagnosticFidelity: 'altered', exactReviewRecord: false })
      else reviews.push(event)
    } catch { incompleteRecords++ }
  }
  const keys = new Set(heads.map(key))
  return { reviews: reviews.toSorted((a, b) => order.get(a) - order.get(b)), alteredReviews, incompleteRecords, malformedEvents, orphanPartGroups: new Set(parts.filter(p => !keys.has(key(p))).map(key)).size }
}
export const reviewMetrics = debug => {
  const parse = marker => [...debug.matchAll(new RegExp(`(?:code-supervisor|deepseek-supervisor): ${marker} (\\{[^\\n]+\\})`, 'g'))].flatMap(m => { try { const v = JSON.parse(m[1]); return v && typeof v === 'object' && !Array.isArray(v) ? [v] : [] } catch { return [] } })
  const records = readReviews(debug), reviews = records.reviews, deliveries = parse('REVIEW_DELIVERY')
  const inputs = readReviewInputs(debug)
  return {
    inputAudit: { prepared: inputs.inputs.length, alteredInputs: inputs.alteredInputs.length, sessionIdentityOmitted: inputs.inputs.filter(e => e.representation === 'session-id-omitted').length, incompleteInputs: inputs.incompleteInputs, malformedEvents: inputs.malformedEvents, orphanPartGroups: inputs.orphanPartGroups },
    reportAudit: { completeRecords: reviews.length, alteredRecords: records.alteredReviews.length, incompleteRecords: records.incompleteRecords, malformedEvents: records.malformedEvents, orphanPartGroups: records.orphanPartGroups },
    factsReturned: parse('ASSIST').filter(e => e.delivery === 'context-returned' && e.packet?.kind === 'location').length,
    sourceFactCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).reduce((n, d) => n + (Number.isSafeInteger(d.sourceFactCount) && d.sourceFactCount > 0 && d.sourceFactCount <= 6 ? d.sourceFactCount : 0), 0),
    reviews, deliveries, deliveryCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).length,
    dimensions: Object.fromEntries(dimensions.map(d => [d, { reviewed: reviews.filter(r => r.reviewed?.includes(d)).length, judgments: reviews.filter(r => r.dimension === d).length, unreviewed: reviews.filter(r => r.unreviewed?.includes(d)).length }])),
    actions: Object.fromEntries(['none', 'location', 'probe', 'recovery'].map(action => [action, reviews.filter(r => r.action === action).length])),
    mainActionChanged: 'unknown', adviceCorrect: 'unknown', validatedBenefit: 'unknown',
    interpretation: 'Review and return counts describe process behavior. Audit actual model-visible feedback, subsequent actions, incorrect advice and independent official acceptance separately. Missing or repeated source is not a new benefit.',
  }
}
