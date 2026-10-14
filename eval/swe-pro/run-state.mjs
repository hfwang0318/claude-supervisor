import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateResume } from './schedule.mjs'

export const validateResult = (row, task, mode, fingerprint) => {
  if (row.task !== task.instanceId || row.mode !== mode || row.experimentSHA256 !== fingerprint || ![true, false, null].includes(row.functionalSuccess)) throw Error('unbound or invalid result receipt')
  if (row.functionalSuccess === null) {
    if (!['environment-error', 'agent-or-model-error', 'timeout', 'cancelled', 'patch-error'].includes(row.status) || row.grade?.reward !== undefined && row.grade.reward !== null) throw Error('contradictory unknown result receipt')
  } else {
    const status = row.functionalSuccess ? 'passed' : 'failed', reward = row.functionalSuccess ? 1 : 0
    if (row.status !== status || row.modelIdentityVerified !== true || row.agent?.patchAvailable !== true || row.grade?.status !== status || row.grade.reward !== reward || row.grade.task !== task.instanceId || row.grade.image !== task.image.pinnedReference || row.grade.baseCommit !== task.baseCommit) throw Error('contradictory graded result receipt')
  }
}

// Run before worker dispatch: a later invalid receipt must not allow earlier
// missing jobs to spend model calls first.
export const freezeExperiment = (out, config, jobs, continuation) => {
  const configPath = join(out, 'experiment.json'), previous = existsSync(configPath)
  if (previous) validateResume(JSON.parse(readFileSync(configPath)), config)
  else if (existsSync(out) && readdirSync(out).length) throw Error('nonempty output directory has unbound results; choose a new directory')
  const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex')
  if (Boolean(config.continuation) !== Boolean(continuation) || continuation && JSON.stringify(config.continuation) !== JSON.stringify(continuation.identity)) throw Error('unbound continuation receipts')
  const completed = new Map(continuation?.completed)
  for (const { task, mode } of jobs) {
    const dir = join(out, task.instanceId, mode), path = join(dir, 'result.json')
    if (completed.has(`${task.instanceId}/${mode}`)) {
      if (existsSync(dir)) throw Error('continued receipt has a duplicate local attempt')
      continue
    }
    if (existsSync(path)) {
      const row = JSON.parse(readFileSync(path))
      validateResult(row, task, mode, fingerprint)
      completed.set(`${task.instanceId}/${mode}`, row)
    } else if (existsSync(dir)) throw Error(`unfinished attempt retained: ${task.instanceId}/${mode}; no automatic retries`)
  }
  mkdirSync(out, { recursive: true })
  if (!previous) writeFileSync(configPath, JSON.stringify(config, null, 2))
  return { fingerprint, completed }
}
