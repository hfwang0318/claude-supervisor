import { test, expect } from 'claude-code/testing'
import { authorizeModelPair } from '../hooks/host'
const pair = { workerId: 'worker-v1', sideId: 'side-v1', relation: 'side-no-stronger' as const, capabilityProfileId: 'measured-1' }

test('unverified identities, aliases and changed workers use rules only', async () => {
  expect(authorizeModelPair(pair, 'worker-v1').allowed).toBe(true)
  expect(authorizeModelPair(pair, 'worker-v2').allowed).toBe(false)
  expect(authorizeModelPair({ ...pair, relation: 'unverified' }, 'worker-v1').allowed).toBe(false)
  expect(authorizeModelPair({ ...pair, sideId: 'opus' }, 'worker-v1').allowed).toBe(false)
  expect(authorizeModelPair({ ...pair, capabilityProfileId: '' }, 'worker-v1').allowed).toBe(false)
  expect(authorizeModelPair({ ...pair, relation: 'same' }, 'worker-v1').allowed).toBe(false)
  expect(authorizeModelPair({ ...pair, sideId: 'worker-v1', relation: 'same' }, 'worker-v1').allowed).toBe(true)
})
