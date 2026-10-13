export const schedule = (tasks, seed) => {
  if (!Number.isSafeInteger(seed)) throw Error('seed required')
  const jobs = tasks.flatMap(task => ['existing', 'facts'].map(mode => ({ task, mode })))
  let state = seed >>> 0
  for (let i = jobs.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[jobs[i], jobs[j]] = [jobs[j], jobs[i]]
  }
  return jobs
}
export const validateResume = (previous, current) => { if (JSON.stringify(previous) !== JSON.stringify(current)) throw Error('frozen configuration changed; use a new output directory') }
export const identityValid = events => events.some(e => ['message_start', 'response'].includes(e.type) && e.identityOK === true) && !events.some(e => ['identity-missing', 'identity-mismatch'].includes(e.type))
export const summarizeUsage = events => {
  const requests = events.filter(e => e.type === 'request' && e.maxOutput !== undefined)
  const observations = requests.map(r => events.filter(e => e.requestId === r.requestId))
  const fields = ['input', 'output', 'cached', 'created']
  const observed = Object.fromEntries(fields.map(key => [key, observations.reduce((sum, rows) => sum + Math.max(0, ...rows.filter(e => e.type !== 'request').map(e => e[key] ?? 0)), 0)]))
  const completeField = key => requests.length > 0 && observations.every(rows => rows.some(e => Number.isFinite(e[key]) && (['message_delta', 'response'].includes(e.type) || e.type === 'message_start' && key !== 'output' && (key !== 'input' || e.input > 0))))
  return { complete: completeField('input') && completeField('output'), ...Object.fromEntries(fields.map(key => [key, completeField(key) ? observed[key] : null])), observed, requests: requests.length }
}
export const boundedMap = (items, concurrency, run, { signal, onError = () => {} } = {}) => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw Error('invalid concurrency')
  return (async () => {
    const results = new Array(items.length)
    let next = 0, failure
    const worker = async () => {
      while (!signal?.aborted && !failure) {
        const index = next++
        if (index >= items.length) return
        try { results[index] = await run(items[index], index) }
        catch (error) { failure = error; onError(error); return }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
    if (failure) throw failure
    return results
  })()
}
