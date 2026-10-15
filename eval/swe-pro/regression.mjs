import { createHash, randomBytes } from 'node:crypto'
import { selectIncremental, summarizeIncremental, nextSelection } from './incremental.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const arms = ['existing', 'facts']
const sameModels = (baseline, identity) => {
  if (!identity.model || !identity.sideModel || baseline.model !== identity.model || baseline.sideModel !== identity.sideModel) throw Error('baseline model identities differ from current main/side models')
}

export const summarizeBaseline = (manifestBytes, results, identity) => {
  const manifest = JSON.parse(manifestBytes)
  if (!Array.isArray(manifest.tasks) || new Set(manifest.tasks.map(t => t.instanceId)).size !== manifest.tasks.length) throw Error('invalid or duplicate manifest tasks')
  const plan = { tasks: manifest.tasks, manifestSHA256: hash(manifestBytes), baseline: Object.fromEntries(manifest.tasks.map(t => [t.instanceId, { existing: 'unknown', facts: 'unknown' }])), skipped: [] }
  const summary = summarizeIncremental(plan, results)
  delete summary.selectionSHA256
  delete summary.baselineSummarySHA256
  return { ...summary, ...identity, kind: 'baseline', interpretation: 'Full frozen project subset on current main/side models; not an official full benchmark score.' }
}

export const baselineSelections = (name, summaryBytes, { seed = randomBytes(16).toString('hex') } = {}) => {
  const summary = JSON.parse(summaryBytes)
  if (!['baseline', 'incremental'].includes(summary.kind) || !summary.complete || summary.kind === 'baseline' && summary.skipped?.length !== 0) throw Error('incomplete or quick round cannot freeze regression selections')
  if (typeof seed !== 'string' || !/^[a-f0-9]{32}$/.test(seed)) throw Error('quick seed must contain 32 lowercase hex characters')
  const incremental = nextSelection(name, summaryBytes)
  const failures = summary.pairs.filter(p => p.existing === 'failed' && p.facts === 'failed')
  const failed = failures.length ? failures[parseInt(createHash('sha256').update(`${hash(summaryBytes)}:${seed}`).digest('hex').slice(0, 8), 16) % failures.length] : null
  const quick = failed ? {
    schemaVersion: 2, kind: 'quick', name: `${name}-quick`, purpose: 'one randomly sampled double failure in both modes; full ordinary checks are separate',
    manifestSHA256: summary.manifestSHA256, baselineSummarySHA256: hash(summaryBytes), arms,
    sampling: { method: 'sha256-seed-v1', seed }, taskCount: 1, plannedAttempts: 2,
    tasks: [{ instanceId: failed.task, repo: failed.repo, baseline: { existing: failed.existing, facts: failed.facts } }]
  } : null
  return { incremental, quick }
}

export const selectRegression = (manifestBytes, selectionBytes, baselineBytes, identity) => {
  const baseline = JSON.parse(baselineBytes), selection = JSON.parse(selectionBytes)
  sameModels(baseline, identity)
  if (selection.kind !== undefined && selection.kind !== 'incremental' && selection.kind !== 'quick') throw Error('invalid regression kind')
  if (baseline.kind === 'quick') throw Error('quick results cannot be used as an incremental baseline')
  if (selection.kind !== 'quick') return { ...selectIncremental(manifestBytes, selectionBytes, baselineBytes), kind: 'incremental' }
  if (selection.schemaVersion !== 2 || selection.sampling?.method !== 'sha256-seed-v1') throw Error('quick selection requires the seeded single-failure protocol; regenerate in a new file')
  const expected = baselineSelections('validation', baselineBytes, { seed: selection.sampling.seed ?? '' }).quick
  if (!expected) throw Error('quick regression requires a double failure; unknowns cannot substitute')
  for (const key of ['schemaVersion', 'manifestSHA256', 'baselineSummarySHA256', 'arms', 'sampling', 'taskCount', 'plannedAttempts', 'tasks']) {
    if (JSON.stringify(selection[key]) !== JSON.stringify(expected[key])) throw Error(`quick selection mismatch: ${key}`)
  }
  if (typeof selection.name !== 'string' || !selection.name.trim() || hash(manifestBytes) !== selection.manifestSHA256) throw Error('invalid quick selection name or manifest hash')
  // Validate both selected and historical coverage without drawing another sample.
  selectIncremental(manifestBytes, JSON.stringify(nextSelection('validation', baselineBytes)), baselineBytes)
  const manifest = JSON.parse(manifestBytes), ids = new Set(selection.tasks.map(t => t.instanceId))
  return {
    kind: 'quick', name: selection.name, manifestSHA256: hash(manifestBytes), baselineSummarySHA256: hash(baselineBytes), selectionSHA256: hash(selectionBytes),
    tasks: selection.tasks.map(row => manifest.tasks.find(t => t.instanceId === row.instanceId)),
    baseline: Object.fromEntries(selection.tasks.map(row => [row.instanceId, row.baseline])),
    skipped: manifest.tasks.filter(t => !ids.has(t.instanceId)).map(t => ({ instanceId: t.instanceId, repo: t.repo, status: 'quick-not-selected' }))
  }
}

export const summarizeRegression = (plan, results, identity) => {
  const summary = { ...summarizeIncremental(plan, results), ...identity, kind: plan.kind }
  if (plan.kind === 'quick') {
    delete summary.remaining
    summary.interpretation = 'Two fixed baseline representatives only; no full score or next failure union can be inferred.'
  }
  return summary
}
