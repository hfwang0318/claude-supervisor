import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capture, cleanup, execute, manifest } from './supervisor-host.mjs'
const source = mkdtempSync(join(tmpdir(), 'dss-source-'))
const binding = { sessionId: 's', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'unknown', snapshotId: 'unknown' }
let snapshot
try {
  writeFileSync(join(source, 'dirty.cjs'), 'process.stdout.write("dirty")\n')
  writeFileSync(join(source, 'untracked.cjs'), 'original\n')
  snapshot = capture(binding, source, Date.now() + 5000)
  assert.equal(readFileSync(join(snapshot.root, 'dirty.cjs'), 'utf8'), 'process.stdout.write("dirty")\n')
  assert.equal(manifest(source, Date.now() + 5000).hash, snapshot.sourceManifestHash)
  if (process.platform === 'darwin') {
    assert.equal(snapshot.isolation, 'boxed-copy')
    let r = await execute(snapshot, 'node dirty.cjs', [], Date.now() + 5000)
    assert.equal(r.stdout, 'dirty')
    assert.equal(r.exitCode, 0)
    assert.equal(r.unchanged, true)
    r = await execute(snapshot, `printf changed > '${join(source, 'untracked.cjs')}'`, [], Date.now() + 5000)
    assert.notEqual(r.exitCode, 0)
    assert.equal(readFileSync(join(source, 'untracked.cjs'), 'utf8'), 'original\n')
    r = await execute(snapshot, 'printf "$SECRET_VALUE"; curl -s --max-time 1 https://example.com', [], Date.now() + 5000)
    assert.notEqual(r.exitCode, 0)
    assert.equal(r.stdout.includes('sentinel-secret'), false)
    r = await execute(snapshot, 'node -e "process.stdout.write(\'a\'.repeat(2000000))"', [], Date.now() + 5000)
    assert.equal(r.truncated, true)
    assert.ok(Buffer.byteLength(r.stdout) <= 1024 * 1024)
    r = await execute(snapshot, 'sleep 30 & wait', [], Date.now() + 500)
    assert.equal(r.cancelled, true)
    assert.ok(r.endedAt - r.startedAt < 2000)
  }
  writeFileSync(join(source, 'untracked.cjs'), 'external edit\n')
  if (process.platform === 'darwin') await assert.rejects(() => execute(snapshot, 'echo yes', [], Date.now() + 5000), /stale workspace/)
  assert.throws(() => cleanup({ ...snapshot, id: 'wrong-owner' }), /ownership mismatch/)
  cleanup(snapshot)
  assert.equal(existsSync(snapshot.root), false)
  snapshot = null
  symlinkSync('/etc/hosts', join(source, 'external'))
  assert.throws(() => capture(binding, source, Date.now() + 5000), /symlink/)
  assert.throws(() => capture(binding, source, Date.now() - 1), /deadline/)
  console.log(`workspace selftest: real files, ownership, stale snapshots${process.platform === 'darwin' ? ', sandbox write/network/env denial, output bound and process timeout' : '; execution unsupported on this platform'}`)
} finally {
  if (snapshot) cleanup(snapshot)
  rmSync(source, { recursive: true, force: true })
}
