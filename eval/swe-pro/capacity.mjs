import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export const readCapacityLease = (path, maximum, now = Date.now()) => {
  try {
    const bytes = readFileSync(path), lease = JSON.parse(bytes)
    return Number.isInteger(lease.limit) && lease.limit >= 0 && lease.limit <= maximum && Number.isFinite(lease.expiresAt) && lease.expiresAt > now && lease.expiresAt <= now + 120000 ? { limit: lease.limit, expiresAt: lease.expiresAt, leaseSHA256: createHash('sha256').update(bytes).digest('hex') } : { limit: 0 }
  } catch { return { limit: 0 } }
}
export const readCapacity = (path, maximum, now) => readCapacityLease(path, maximum, now).limit

export const admissionPolicy = ({ concurrency, overcommit, swapBytes, capacityFile }) => ({
  ...(concurrency > 2 ? { overcommit, swapBytes, monitoringRequired: true, perTaskMemoryBytes: 4 * 1024 ** 3 } : {}),
  ...(capacityFile ? { capacityFile, capacityLeaseMaxAgeMs: 120000 } : {})
})

export const registerDrainSignals = (tasks, dispatch, interrupted) => {
  const interrupt = () => { interrupted(); tasks.abort(); dispatch.abort() }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  process.on('SIGUSR2', () => { interrupted(); dispatch.abort() })
  return interrupt
}

export const capacityTarget = (previous, { available, swapUsed }, maximum) => {
  if (!Number.isFinite(available) || !Number.isFinite(swapUsed) || available < 1.5 * 1024 ** 3 || swapUsed > 512 * 1024 ** 2) return 0
  return available >= 4 * 1024 ** 3 && swapUsed < 256 * 1024 ** 2 ? Math.min(maximum, previous + 1) : previous
}

// A short-lived resource lease controls admission only. Shrinking the lease or
// draining the queue never cancels an already running model or grader.
export const adaptiveMap = (items, maximum, run, { capacityFile, signal, onError = () => {}, pollMs = 250 } = {}) => {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 8 || !capacityFile) throw Error('invalid adaptive capacity configuration')
  return (async () => {
    let next = 0, active = 0, failure
    const results = new Array(items.length)
    const worker = async () => {
      while (!signal?.aborted && !failure && next < items.length) {
        const lease = readCapacityLease(capacityFile, maximum), { limit } = lease
        if (active >= limit) { await new Promise(ok => setTimeout(ok, pollMs)); continue }
        const index = next++
        active++
        try { results[index] = await run(items[index], index, { activeWorkers: active, ...lease }) }
        catch (error) { failure = error; onError(error) }
        finally { active-- }
      }
    }
    await Promise.all(Array.from({ length: Math.min(maximum, items.length) }, worker))
    if (failure) throw failure
    return results
  })()
}
