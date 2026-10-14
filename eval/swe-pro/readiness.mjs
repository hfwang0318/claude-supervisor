import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { command, prepareTask } from './docker.mjs'
import { boundedMap } from './schedule.mjs'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
const manifest = JSON.parse(readFileSync(resolve('eval/data/swe-pro-v2/subset-v1.json')))
const tasksRoot = resolve(arg('tasks-root', '.superpowers/sdd/2026-10-13-local-swe-pro-glm53/tasks'))
const out = resolve(arg('out', 'eval/results/swe-pro-glm53/readiness'))
const tasks = manifest.tasks.filter(t => !process.argv.includes('--smoke') || t.smoke)
const jobs = Number(arg('jobs', '2'))
if (![1, 2].includes(jobs)) throw Error('concurrency must be 1 or 2')
const info = await command(['info', '--format', '{{.MemTotal}}'])
if (info.exitCode !== 0 || jobs === 2 && Number(info.stdout) < 8.5 * 1024 ** 3) throw Error('two jobs require at least 8.5 GiB Docker VM memory')
mkdirSync(out, { recursive: true })
await boundedMap(tasks, jobs, async task => {
  const dir = join(out, task.instanceId)
  const receipt = await prepareTask(task, tasksRoot, dir, { progress: phase => console.log(new Date().toISOString(), task.repo, phase) })
  console.log(task.repo, 'ready:', receipt.ready)
})
