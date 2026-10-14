import assert from 'node:assert/strict'
const api = await import('./capacity-monitor.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e })
assert.equal(typeof api.advanceCapacity, 'function', 'monitor must require sustained headroom and pause admission on missing or pressured resource evidence')
const GiB = 1024 ** 3
const safe = { available: 5 * GiB, swapUsed: 0 }
let state = { limit: 6, safeSamples: 0 }
state = api.advanceCapacity(state, safe, 8)
assert.equal(state.limit, 6)
state = api.advanceCapacity(state, safe, 8)
assert.equal(state.limit, 6)
state = api.advanceCapacity(state, safe, 8)
assert.equal(state.limit, 7)
state = api.advanceCapacity(state, { available: GiB, swapUsed: 0 }, 8)
assert.equal(state.limit, 0)
state = api.advanceCapacity(state, safe, 8)
state = api.advanceCapacity(state, {}, 8)
assert.equal(state.limit, 0)
assert.equal(state.safeSamples, 0)
const sample = api.parseVmMemory('MemTotal: 9000000 kB\nMemAvailable: 5000000 kB\nSwapTotal: 1048576 kB\nSwapFree: 1048500 kB\n')
assert.equal(sample.available, 5000000 * 1024)
assert.equal(sample.swapUsed, 76 * 1024)
assert.equal(api.advanceCapacity({ limit: 6, safeSamples: 2 }, api.parseVmMemory('broken'), 8).limit, 0)
assert.equal(api.advanceCapacity({ limit: 8, safeSamples: 2 }, safe, 8).limit, 8)
console.log('SWE Pro capacity monitor self-tests passed')
