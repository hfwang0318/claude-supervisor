import { test as hostTest } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

export const MODEL_OPTIONS = { worker_model: 'test-worker-v1', verifier_model: 'test-side-v1', model_relation: 'side-no-stronger', capability_profile: 'fixture-versioned-reasoning-profile', execution_mode: 'enabled' }
export const testWithPair: typeof hostTest = (name, ...rest) => {
  if (rest.length === 1) return hostTest(name, { options: MODEL_OPTIONS }, rest[0] as TestBody)
  const [options, body] = rest
  return hostTest(name, { ...options, options: { ...MODEL_OPTIONS, ...options.options } }, body)
}
