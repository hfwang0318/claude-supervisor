import { test, expect } from 'claude-code/testing'
import { selectSideModel } from '../hooks/host'

test('empty side configuration follows the current worker, including host aliases', async () => {
  expect(selectSideModel('', 'worker-v1').modelId).toBe('worker-v1')
  expect(selectSideModel('  ', 'sonnet').modelId).toBe('sonnet')
  expect(selectSideModel('', 'worker-v2').modelId).toBe('worker-v2')
})

test('an explicitly chosen side model needs no worker match or capability relationship', async () => {
  expect(selectSideModel('opus', 'worker-v1').modelId).toBe('opus')
  expect(selectSideModel(' side-v1 ', 'worker-v2').modelId).toBe('side-v1')
  expect(selectSideModel('side-v1', '').modelId).toBe('side-v1')
})

test('an unavailable default worker identity leaves no model to call', async () => {
  expect(selectSideModel('', '').modelId).toBeNull()
})
