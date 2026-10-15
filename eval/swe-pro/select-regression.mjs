import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { baselineSelections, selectRegression } from './regression.mjs'
import { MODEL } from './gateway.mjs'

const flags = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1]
  if (!['--kind', '--manifest', '--baseline-summary', '--out', '--seed'].includes(key) || flags.has(key) || !value || value.startsWith('--')) throw Error('invalid selection arguments')
  flags.set(key, value)
}
const kind = flags.get('--kind')
if (!['quick', 'incremental'].includes(kind) || !flags.has('--baseline-summary') || !flags.has('--out')) throw Error('required: --kind quick|incremental --baseline-summary SUMMARY --out NEW_FILE [--seed HEX]')
if (kind !== 'quick' && flags.has('--seed')) throw Error('--seed applies only to quick sampling')
const manifest = readFileSync(resolve(flags.get('--manifest') ?? 'eval/data/swe-pro-v2/subset-v1.json'))
const baseline = readFileSync(resolve(flags.get('--baseline-summary')))
const selections = baselineSelections('glm53-flash-regression', baseline, flags.has('--seed') ? { seed: flags.get('--seed') } : undefined)
const selection = selections[kind]
if (!selection) throw Error('quick unavailable: no double failure; no substituted task or model execution')
const bytes = JSON.stringify(selection, null, 2) + '\n'
const plan = selectRegression(manifest, bytes, baseline, { model: MODEL, sideModel: MODEL })
const out = resolve(flags.get('--out'))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes, { flag: 'wx' })
console.log(JSON.stringify({ kind, tasks: plan.tasks.map(t => t.instanceId), plannedAttempts: plan.tasks.length * 2, selection: out, modelExecution: false }))
