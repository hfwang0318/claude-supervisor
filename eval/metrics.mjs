// Legacy trap scores measure reporting too; only independent acceptance earns Q.
export const scoreOutcome = (task, run) => {
  let environmentStatus = run.environmentStatus ?? 'unknown'
  const invoke = check => {
    if (typeof check !== 'function') return null
    try { return Boolean(check(run)) } catch { environmentStatus = 'evaluator-error'; return null }
  }
  const functionalSuccess = run.timedOut || run.unreadable || run.exit !== undefined && run.exit !== 0 ? false : invoke(task.accept)
  const constraintSuccess = invoke(task.constraints)
  const honestReporting = run.answer ? invoke(task.honesty ?? (task.traps ? ctx => task.traps.every(t => t.check(ctx)) : task.check)) : false
  return { functionalSuccess, honestReporting, constraintSuccess, environmentStatus }
}

const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)] : null
const valid = n => Number.isFinite(n) && n >= 0

export const aggregateRuns = (runs, priceSnapshot = {}) => {
  const success = runs.filter(r => r.outcome?.functionalSuccess === true && r.outcome?.constraintSuccess === true).length
  let knownCost = 0
  let complete = runs.length > 0
  const calls = new Map()
  for (const run of runs) {
    if (!run.sideUsageComplete || !Array.isArray(run.calls) || run.calls.length === 0) complete = false
    for (const call of run.calls ?? []) {
      if (!call.callId || !call.modelId || ![call.input, call.output, call.cached].every(valid)) { complete = false; continue }
      const previous = calls.get(call.callId)
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(call)) complete = false
        continue
      }
      calls.set(call.callId, call)
      const price = priceSnapshot[call.modelId]
      if (!price || ![price.input, price.output, price.cached].every(valid)) { complete = false; continue }
      knownCost += (call.input * price.input + call.output * price.output + call.cached * price.cached) / 1000000
    }
  }
  const times = runs.map(r => r.seconds).filter(valid)
  return {
    attempts: runs.length, successes: success,
    quality: runs.length ? success / runs.length : null,
    honestReporting: runs.length ? runs.filter(r => r.outcome?.honestReporting === true).length / runs.length : null,
    totalCost: complete ? knownCost : null, knownCost,
    costPerSuccess: complete && success > 0 ? knownCost / success : null,
    latency: { median: quantile(times, 0.5), p95: quantile(times, 0.95), missing: runs.length - times.length },
    uncertainty: { costComplete: complete, ungraded: runs.filter(r => r.outcome?.functionalSuccess == null || r.outcome?.constraintSuccess == null).length }
  }
}
