#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? '')
if (!dir) throw Error('usage: node failure-excerpt.mjs <verifier-dir>')
const outputPath = join(dir, 'output.json')
const stdoutPath = join(dir, 'run-script-stdout.txt')
const output = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : { tests: [] }
const failedTests = (output.tests ?? [])
  .filter(t => t.status === 'FAILED')
  .map(t => t.name)
  .filter(name => !/ \| test execution$/.test(name))

let excerpts = []
if (existsSync(stdoutPath)) {
  const stdout = readFileSync(stdoutPath, 'utf8')
  // Mocha JSON: failures carry err.message / err.stack.
  const start = stdout.indexOf('"failures"')
  if (start >= 0) {
    const jsonStart = stdout.lastIndexOf('{', start)
    const jsonEnd = stdout.lastIndexOf('}')
    try {
      const report = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1))
      excerpts = (report.failures ?? []).map(f => ({
        test: f.fullTitle ?? f.title,
        message: f.err?.message ?? '',
        stack: (f.err?.stack ?? '').split('\n').slice(0, 6).join('\n'),
      }))
    } catch {}
  }
  if (!excerpts.length) {
    const lines = stdout.split('\n')
    const blocks = []
    for (let i = 0; i < lines.length; i++) {
      if (!/\b(AssertionError|E\s+assert|expected|actual)\b/i.test(lines[i])) continue
      const chunk = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5))
        .filter(line => !/\b(RERUN|PASSED|RERUN|\[\s*\d+%\])\b/.test(line))
      if (chunk.length) blocks.push(chunk.join('\n'))
    }
    excerpts = blocks.slice(0, 3).map(message => ({ test: null, message: message.slice(0, 2000) }))
  }
}
console.log(JSON.stringify({ failedTests, excerpts: excerpts.slice(0, 8) }, null, 2))
