import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { handle } from './supervisor-host.mjs'
const root = mkdtempSync(join(tmpdir(), 'dss-facts-'))
const deadline = () => Date.now() + 5000
const inspect = request => handle({ action: 'inspect', root, request, deadlineMs: deadline() })
try {
  writeFileSync(join(root, 'app.cjs'), 'exports.day = require("./utils.cjs").parseDate\n')
  writeFileSync(join(root, 'utils.cjs'), 'exports.parseDate = s => Number(s.slice(-2))\n')
  writeFileSync(join(root, '.env'), 'API_KEY=never-expose-this\n')
  const view = await inspect({ paths: ['app.cjs'], terms: ['parseDate'] })
  assert.equal(view.incomplete, false, 'inspect must return a complete source view')
  assert.ok(view.facts.some(f => f.path === 'app.cjs' && f.startLine === 1 && f.quote === readFileSync(join(root, 'app.cjs'), 'utf8').trim()))
  assert.ok(view.facts.some(f => f.path === 'utils.cjs'))
  assert.ok(!JSON.stringify(view).includes('never-expose-this'))
  assert.equal(await handle({ action: 'validate-facts', root, view, deadlineMs: deadline() }), true)
  let fdReads = 0
  const readBeforeGroup = fs.default.readFileSync
  fs.default.readFileSync = (...args) => {
    const bytes = readBeforeGroup(...args)
    if (typeof args[0] === 'number' && ++fdReads === 2) writeFileSync(join(root, 'app.cjs'), 'exports.day = require("./utils.cjs").changed\n')
    return bytes
  }
  syncBuiltinESMExports()
  try { assert.equal(await handle({ action: 'validate-facts', root, view, deadlineMs: deadline() }), false, 'later reads cannot accept an already changed source') }
  finally { fs.default.readFileSync = readBeforeGroup; syncBuiltinESMExports(); writeFileSync(join(root, 'app.cjs'), 'exports.day = require("./utils.cjs").parseDate\n') }
  for (const path of ['../outside', '/etc/passwd', '.env', 'dir/../../x', 'missing.cjs']) assert.equal((await inspect({ paths: [path], terms: [] })).incomplete, true, path)
  symlinkSync(join(root, 'utils.cjs'), join(root, 'alias.cjs'))
  assert.equal((await inspect({ paths: ['alias.cjs'], terms: [] })).incomplete, true)
  unlinkSync(join(root, 'alias.cjs'))
  const originalRead = fs.default.readFileSync
  let mutated = false
  fs.default.readFileSync = (...args) => {
    const bytes = originalRead(...args)
    if (!mutated && typeof args[0] === 'number') { mutated = true; writeFileSync(join(root, 'utils.cjs'), 'changed during read\n') }
    return bytes
  }
  syncBuiltinESMExports()
  try { assert.equal((await inspect({ paths: ['utils.cjs'], terms: [] })).incomplete, true, 'real mutation during read must discard the view') }
  finally { fs.default.readFileSync = originalRead; syncBuiltinESMExports() }
  writeFileSync(join(root, 'utils.cjs'), 'changed\n')
  assert.equal(await handle({ action: 'validate-facts', root, view, deadlineMs: deadline() }), false, 'changed search source invalidates delivery')
  unlinkSync(join(root, 'app.cjs'))
  assert.equal(await handle({ action: 'validate-facts', root, view, deadlineMs: deadline() }), false)
  writeFileSync(join(root, 'huge.cjs'), 'x'.repeat(256 * 1024 + 1))
  assert.equal((await inspect({ paths: ['huge.cjs'], terms: [] })).incomplete, true)
  writeFileSync(join(root, 'many.cjs'), ('x'.repeat(200) + '\n').repeat(200))
  assert.equal((await inspect({ paths: ['many.cjs'], terms: [] })).incomplete, true, 'output range must not silently truncate')
  writeFileSync(join(root, 'secret.cjs'), 'const password = "secret-value-123"\nexports.public = 1\n')
  const safe = await inspect({ paths: ['secret.cjs'], terms: [] })
  assert.equal(safe.incomplete, true, 'redacted source cannot be an exact fact')
  assert.ok(!JSON.stringify(safe).includes('secret-value-123'))
  const wide = join(root, 'wide'); mkdirSync(wide)
  for (let n = 0; n < 201; n++) writeFileSync(join(wide, `${n}.cjs`), 'no matches\n')
  assert.equal((await inspect({ paths: [], terms: ['absent'] })).incomplete, true)
  assert.equal((await handle({ action: 'inspect', root, request: { paths: ['secret.cjs'], terms: [] }, deadlineMs: Date.now() - 1 })).incomplete, true)
  const missing = await inspect({ paths: ['missing.cjs'], terms: [] })
  assert.equal(missing.failureReason, 'source-missing', 'a missing source must be distinct from a deadline or safety rejection')
  assert.deepEqual(missing.facts, []); assert.deepEqual(missing.files, [])
  assert.equal((await inspect({ paths: ['huge.cjs'], terms: [] })).failureReason, 'file-limit')
  assert.equal((await inspect({ paths: ['many.cjs'], terms: [] })).failureReason, 'output-limit')
  assert.equal((await inspect({ paths: ['secret.cjs'], terms: [] })).failureReason, 'secret-content')
  assert.equal((await inspect({ paths: ['../outside'], terms: [] })).failureReason, 'invalid-request')
  assert.equal((await handle({ action: 'inspect', root, request: { paths: ['secret.cjs'], terms: [] }, deadlineMs: Date.now() - 1 })).failureReason, 'deadline')
  console.log('real facts selftest: exact imports, source changes, deletion, paths, symlinks, secret lines, byte/file/output limits and deadlines passed')
} finally { rmSync(root, { recursive: true, force: true }) }
