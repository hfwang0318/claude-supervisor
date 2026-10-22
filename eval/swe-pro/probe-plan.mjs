#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const [resultsPath, outPath] = process.argv.slice(2)
if (!resultsPath || !outPath) throw Error('usage: node probe-plan.mjs <results.json> <out.json>')
const summary = JSON.parse(readFileSync(resolve(resultsPath), 'utf8'))
const verified = (summary.results ?? []).filter(r => r.status === 'verified' && r.compiled?.command)
if (!verified.length) throw Error('no verified probe')
const unquote = s => s.replaceAll("'\\''", "'")
const parseGrep = command => {
  const parts = command.split('&&').map(s => s.trim()).filter(Boolean)
  return parts.map(part => {
    const match = part.match(/^!?\s*grep -Fq -- (.*) ([^\s]+)$/)
    if (!match) return null
    let quoted = match[1]
    if (quoted.startsWith("'") && quoted.endsWith("'")) quoted = quoted.slice(1, -1)
    return { text: unquote(quoted), file: match[2] }
  }).filter(Boolean)
}
const findings = verified.map(r => {
  const greps = parseGrep(r.compiled.command)
  const file = greps.at(-1)?.file ?? ''
  const current = greps.length > 1 ? greps[0].text : ''
  const required = greps.at(-1)?.text ?? ''
  return {
    requirement: required,
    concern: `Verified control-only line in ${file}.`,
    location: `${file}:${required.trim().slice(0, 40)}`,
    current,
    required,
    check: 'Apply the candidate and control patches, run the verified probe command.',
    expectedFailure: 'candidate fails, control passes',
    confidence: 'high',
  }
})
writeFileSync(resolve(outPath), JSON.stringify({ findings }, null, 2))
console.log(JSON.stringify({ findings: findings.length, locations: findings.map(f => f.location) }, null, 2))
