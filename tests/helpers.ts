import { test as hostTest } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

export const MODEL_OPTIONS = { verifier_model: 'test-side-v1', execution_mode: 'enabled' }
export const testWithPair: typeof hostTest = (name, ...rest) => {
  if (rest.length === 1) return hostTest(name, { options: MODEL_OPTIONS }, rest[0] as TestBody)
  const [options, body] = rest
  return hostTest(name, { ...options, options: { ...MODEL_OPTIONS, ...options.options } }, body)
}
