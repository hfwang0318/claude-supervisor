import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { command, verifyArtifacts, grade, readyPair } from './docker.mjs'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
const manifest = JSON.parse(readFileSync(resolve('eval/data/swe-pro-v2/subset-v1.json')))
const tasksRoot = resolve(arg('tasks-root', '.superpowers/sdd/2026-10-13-local-swe-pro-glm53/tasks'))
const out = resolve(arg('out', 'eval/results/swe-pro-glm53/readiness'))
const tasks = manifest.tasks.filter(t => !process.argv.includes('--smoke') || t.smoke)
mkdirSync(out, { recursive: true })
for (const task of tasks) {
  const dir = join(out, task.instanceId)
  const previous = join(dir, 'readiness.json')
  if (existsSync(previous) && JSON.parse(readFileSync(previous)).ready) { console.log(task.repo, 'already ready'); continue }
  verifyArtifacts(task, tasksRoot)
  console.log(new Date().toISOString(), task.repo, 'pull')
  const pulled = await command(['pull', '--platform', 'linux/amd64', task.image.pinnedReference], { timeoutMs: 1_800_000, log: join(out, `${task.instanceId}-pull.log`) })
  if (pulled.exitCode !== 0) { console.log('pull failed', pulled.stderr.slice(-500)); continue }
  console.log(task.repo, 'empty patch')
  const empty = await grade(task, tasksRoot, '', join(dir, 'empty'))
  console.log(task.repo, 'reference patch')
  const reference = await grade(task, tasksRoot, readFileSync(join(tasksRoot, task.instanceId, 'solution/gold_patch.diff'), 'utf8'), join(dir, 'reference'))
  const receipt = { task: task.instanceId, image: task.image.pinnedReference, empty, reference, ready: readyPair(empty, reference) }
  writeFileSync(previous, JSON.stringify(receipt, null, 2))
  console.log(task.repo, 'ready:', receipt.ready, 'empty:', empty.status, 'reference:', reference.status)
}
