// These are observed review events, never inferred gains or correctness verdicts.
const dimensions = ['requirement-plan', 'plan-implementation', 'architecture', 'direction', 'exploration', 'verification', 'recovery']
export const reviewMetrics = debug => {
  const parse = marker => [...debug.matchAll(new RegExp(`deepseek-supervisor: ${marker} (\\{[^\\n]+\\})`, 'g'))].flatMap(m => { try { const v = JSON.parse(m[1]); return v && typeof v === 'object' && !Array.isArray(v) ? [v] : [] } catch { return [] } })
  const reviews = parse('REVIEW'), deliveries = parse('REVIEW_DELIVERY')
  return {
    factsReturned: parse('ASSIST').filter(e => e.delivery === 'context-returned' && e.packet?.kind === 'location').length,
    sourceFactCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).reduce((n, d) => n + (Number.isSafeInteger(d.sourceFactCount) && d.sourceFactCount > 0 && d.sourceFactCount <= 6 ? d.sourceFactCount : 0), 0),
    reviews, deliveries, deliveryCount: deliveries.filter(d => ['context-returned', 'submitted'].includes(d.delivery)).length,
    dimensions: Object.fromEntries(dimensions.map(d => [d, { reviewed: reviews.filter(r => r.reviewed?.includes(d)).length, judgments: reviews.filter(r => r.dimension === d).length, unreviewed: reviews.filter(r => r.unreviewed?.includes(d)).length }])),
    actions: Object.fromEntries(['none', 'location', 'probe', 'recovery'].map(action => [action, reviews.filter(r => r.action === action).length])),
    mainActionChanged: 'unknown', adviceCorrect: 'unknown', validatedBenefit: 'unknown',
    interpretation: 'Review and return counts describe process behavior. Audit actual model-visible feedback, subsequent actions, incorrect advice and independent official acceptance separately. Missing or repeated source is not a new benefit.',
  }
}
