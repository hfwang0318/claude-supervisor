import assert from 'node:assert/strict'
import { schedule, validateResume, identityValid, summarizeUsage, boundedMap } from './schedule.mjs'
const tasks = Array.from({ length: 30 }, (_, n) => ({ instanceId: `case-${n}` }))
const jobs = schedule(tasks, 53)
assert.equal(jobs.length, 60)
assert.equal(new Set(jobs.map(j => `${j.task.instanceId}/${j.mode}`)).size, 60)
assert.deepEqual(schedule(tasks, 53), jobs)
assert.notDeepEqual(schedule(tasks, 54), jobs)
assert.doesNotThrow(() => validateResume({ model: 'glm-5.3' }, { model: 'glm-5.3' }))
assert.throws(() => validateResume({ model: 'glm-5.2' }, { model: 'glm-5.3' }), /changed/)
assert.equal(identityValid([{ type: 'message_start', model: 'glm-5.3', identityOK: true }]), true)
assert.equal(identityValid([]), false)
assert.equal(identityValid([{ type: 'message_start', model: 'glm-5.3', identityOK: true }, { type: 'identity-missing' }]), false)
assert.equal(identityValid([{ type: 'identity-mismatch', model: 'glm-5.3-flash' }]), false)
const partial = summarizeUsage([{ requestId: 'r', type: 'request', maxOutput: 10 }, { requestId: 'r', type: 'message_start', input: 15, output: 0 }])
assert.equal(partial.complete, false)
assert.equal(partial.output, null)
assert.equal(partial.observed.input, 15)
const complete = summarizeUsage([{ requestId: 'r', type: 'request', maxOutput: 10 }, { requestId: 'r', type: 'message_start', input: 15 }, { requestId: 'r', type: 'message_delta', output: 3 }])
assert.equal(complete.complete, true)
assert.equal(complete.input, 15)
assert.equal(complete.output, 3)
let active = 0, peak = 0
const starts = []
const mapped = await boundedMap([0, 1, 2, 3, 4], 2, async value => {
  starts.push(value); active++; peak = Math.max(peak, active)
  await new Promise(ok => setTimeout(ok, 10)); active--; return value * 2
})
assert.equal(peak, 2)
assert.deepEqual(starts, [0, 1, 2, 3, 4])
assert.deepEqual(mapped, [0, 2, 4, 6, 8])
const controller = new AbortController(), cancelledStarts = []
await boundedMap([0, 1, 2, 3], 2, async value => { cancelledStarts.push(value); await new Promise(ok => setTimeout(ok, 10)); controller.abort() }, { signal: controller.signal })
assert.equal(cancelledStarts.length, 2)
assert.throws(() => boundedMap([], 0, () => {}), /concurrency/)
let cleaned = false
const errorStarts = []
await assert.rejects(boundedMap([0, 1, 2, 3], 2, async value => {
  errorStarts.push(value)
  if (value === 0) { await new Promise(ok => setTimeout(ok, 5)); throw Error('controlled failure') }
  await new Promise(ok => setTimeout(ok, 15)); cleaned = true
}), /controlled failure/)
assert.equal(cleaned, true)
assert.deepEqual(errorStarts, [0, 1])
console.log('SWE Pro schedule self-tests passed')
