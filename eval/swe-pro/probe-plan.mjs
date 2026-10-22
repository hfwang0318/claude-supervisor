#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const [resultsPath, outPath, candidatePath, controlPath] = process.argv.slice(2)
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
const controlLines = controlPath ? readFileSync(resolve(controlPath), 'utf8').split('\n') : []
const candidateLines = candidatePath ? readFileSync(resolve(candidatePath), 'utf8').split('\n') : []
const functionAt = (lines, needle) => {
  const idx = lines.findIndex(l => l.includes(needle) && !l.startsWith('diff --git'))
  if (idx < 0) return null
  let start = idx
  while (start > 0 && !/(?:async\s+)?function\b|\bdef\s+\w+|\.\w+\s*=\s*(?:async\s*)?function/.test(lines[start])) start--
  if (start === idx && !/(?:async\s+)?function\b|\bdef\s+\w+/.test(lines[idx])) return null
  let end = start
  while (end < lines.length - 1 && !/^\s*\};?\s*$/.test(lines[end])) end++
  return lines.slice(start, end + 1).join('\n').replace(/^\+/gm, '')
}
const findings = verified.map(r => {
  const greps = parseGrep(r.compiled.command)
  const file = greps.at(-1)?.file ?? ''
  let current = greps.length > 1 ? greps[0].text : ''
  let required = greps.at(-1)?.text ?? ''
  if (controlLines.length) {
    const ctrlBody = functionAt(controlLines, required)
    if (ctrlBody) required = ctrlBody
    if (candidateLines.length) {
      const name = (required.match(/(?:function\s+|def\s+)(\w+)/) ?? [])[1]
      const candBody = name ? functionAt(candidateLines, name) : null
      if (candBody) current = candBody
    }
  }
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
