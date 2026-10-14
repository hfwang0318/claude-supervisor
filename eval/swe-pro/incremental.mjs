import { createHash } from 'node:crypto'

const arms = ['existing', 'facts']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const outcome = value => {
  if (value === 'passed' || value === 'failed') return value
  if (['unknown', 'environment-error', 'agent-or-model-error', 'timeout', 'cancelled', 'agent-error'].includes(value)) return 'unknown'
  throw Error('invalid baseline outcome')
}

export const selectIncremental = (manifestBytes, selectionBytes, baselineBytes) => {
  const manifest = JSON.parse(manifestBytes), selection = JSON.parse(selectionBytes), baseline = JSON.parse(baselineBytes)
  const manifestSHA256 = hash(manifestBytes), baselineSummarySHA256 = hash(baselineBytes)
  if (selection.schemaVersion !== 1 || typeof selection.name !== 'string' || !selection.name.trim()) throw Error('invalid selection schema')
  if (selection.manifestSHA256 !== manifestSHA256 || baseline.manifestSHA256 !== manifestSHA256) throw Error('manifest hash mismatch')
  if (selection.baselineSummarySHA256 !== baselineSummarySHA256 || baseline.complete !== true) throw Error('baseline hash mismatch or incomplete baseline')
  if (JSON.stringify(selection.arms) !== JSON.stringify(arms)) throw Error('both comparison arms required')
  if (!Array.isArray(manifest.tasks) || !Array.isArray(selection.tasks) || !Array.isArray(baseline.pairs)) throw Error('invalid task lists')
  const canonical = new Map(manifest.tasks.map(t => [t.instanceId, t]))
  if (canonical.size !== manifest.tasks.length) throw Error('duplicate manifest task')
  const previous = new Map()
  for (const pair of baseline.pairs) {
    if (!canonical.has(pair.task) || previous.has(pair.task)) throw Error('unknown or duplicate baseline task')
    previous.set(pair.task, { existing: outcome(pair.existing), facts: outcome(pair.facts) })
  }
  const retired = new Set()
  for (const row of baseline.skipped ?? []) {
    if (!canonical.has(row.instanceId) || previous.has(row.instanceId) || retired.has(row.instanceId) || row.status !== 'historical-both-passed-not-run') throw Error('invalid historical skipped task')
    retired.add(row.instanceId)
  }
  if (previous.size + retired.size !== canonical.size) throw Error('baseline task coverage incomplete')
  const expected = new Set([...previous].filter(([, values]) => arms.some(mode => values[mode] !== 'passed')).map(([id]) => id))
  const selected = new Set()
  for (const row of selection.tasks) {
    if (selected.has(row.instanceId)) throw Error('duplicate selected task')
    selected.add(row.instanceId)
    if (!expected.has(row.instanceId)) throw Error('selection differs from failure/unknown union')
    if (row.repo !== canonical.get(row.instanceId).repo) throw Error('selected repo mismatch')
    if (arms.some(mode => row.baseline?.[mode] !== previous.get(row.instanceId)[mode])) throw Error('selected baseline outcome mismatch')
  }
  if (selected.size !== expected.size) throw Error('selection omits failure/unknown union task')
  if (selection.taskCount !== selected.size || selection.plannedAttempts !== selected.size * 2 || selection.skippedBothPassed !== canonical.size - selected.size) throw Error('selection count mismatch')
  return {
    name: selection.name, manifestSHA256, baselineSummarySHA256, selectionSHA256: hash(selectionBytes),
    tasks: selection.tasks.map(row => canonical.get(row.instanceId)),
    baseline: Object.fromEntries(selection.tasks.map(row => [row.instanceId, previous.get(row.instanceId)])),
    skipped: manifest.tasks.filter(t => !selected.has(t.instanceId)).map(t => ({ instanceId: t.instanceId, repo: t.repo, status: 'historical-both-passed-not-run' }))
  }
}

export const summarizeIncremental = (plan, results) => {
  const byTask = new Map(plan.tasks.map(t => [t.instanceId, {}]))
  const counts = Object.fromEntries(arms.map(mode => [mode, { passed: 0, failed: 0, unknown: 0, pending: 0, repaired: 0, regressed: 0, stillFailed: 0 }]))
  for (const row of results) {
    if (!byTask.has(row.task) || !arms.includes(row.mode)) throw Error('result outside planned task/arm')
    const pair = byTask.get(row.task)
    if (pair[row.mode]) throw Error('duplicate result')
    if (![true, false, null].includes(row.functionalSuccess)) throw Error('invalid result outcome')
    pair[row.mode] = row.functionalSuccess === true ? 'passed' : row.functionalSuccess === false ? 'failed' : 'unknown'
  }
  const pairs = plan.tasks.map(task => {
    const values = byTask.get(task.instanceId)
    for (const mode of arms) {
      const current = values[mode] ?? 'pending', previous = plan.baseline[task.instanceId][mode]
      counts[mode][current]++
      if (previous === 'failed' && current === 'passed') counts[mode].repaired++
      if (previous === 'passed' && current === 'failed') counts[mode].regressed++
      if (previous === 'failed' && current === 'failed') counts[mode].stillFailed++
    }
    return { task: task.instanceId, repo: task.repo, existing: values.existing ?? 'pending', facts: values.facts ?? 'pending', baseline: plan.baseline[task.instanceId] }
  })
  const remaining = pairs.filter(pair => arms.some(mode => pair[mode] !== 'passed')).map(pair => ({ instanceId: pair.task, repo: pair.repo, baseline: { existing: pair.existing, facts: pair.facts } }))
  const planned = plan.tasks.length * 2
  return { schemaVersion: 1, interpretation: 'Incremental cohort only; historical skipped tasks were not run on this version.', manifestSHA256: plan.manifestSHA256, selectionSHA256: plan.selectionSHA256, baselineSummarySHA256: plan.baselineSummarySHA256, complete: results.length === planned, finished: results.length, planned, arms: counts, pairs, remaining, skipped: plan.skipped, costUSD: 'unknown' }
}

export const nextSelection = (name, summaryBytes) => {
  const summary = JSON.parse(summaryBytes)
  if (summary.kind === 'quick') throw Error('quick results cannot freeze the next failure union')
  if (!summary.complete) throw Error('incomplete round cannot freeze the next selection')
  return {
    schemaVersion: 1, name: `${name}-next`, purpose: 'incremental development comparison; not a full benchmark score',
    manifestSHA256: summary.manifestSHA256, baselineSummarySHA256: hash(summaryBytes),
    selection: 'same-round failure/unknown union; historical both-passed tasks remain skipped',
    arms, taskCount: summary.remaining.length, plannedAttempts: summary.remaining.length * 2,
    skippedBothPassed: summary.skipped.length + summary.pairs.length - summary.remaining.length,
    tasks: summary.remaining
  }
}
