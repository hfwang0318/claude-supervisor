// Reproducible Linux isolation check. Run as: node scripts/linux-selftest.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capture, execute, cleanup } from './supervisor-host.mjs'

if (process.platform !== 'linux') {
  console.log(JSON.stringify({ status: 'skip', reason: 'not-linux' }))
  process.exit(0)
}
const root = mkdtempSync(join(tmpdir(), 'dss-linux-selftest-'))
const workspace = join(root, 'ws')
mkdirSync(workspace)
writeFileSync(join(workspace, 'a'), 'hi\n')
const binding = { sessionId: 'selftest', generationId: 'g', turnId: 't', taskRevision: 1, workspaceRevision: 'v', snapshotId: 'unknown' }
try {
  const snapshot = await capture(binding, workspace, Date.now() + 15000)
  if (snapshot.isolation !== 'boxed-copy') {
    console.log(JSON.stringify({ status: 'read-only', backend: snapshot.backend ?? null }))
  } else {
    const result = await execute(snapshot, 'cat a; echo x > b; test ! -e /home; test ! -e /root/.ssh; echo ISOLATED', [], Date.now() + 15000)
    if (result.exitCode !== 0 || !result.stdout.includes('hi') || !result.stdout.includes('ISOLATED')) throw Error(`probe failed: ${JSON.stringify(result)}`)
    console.log(JSON.stringify({ status: 'boxed', backend: snapshot.backend, exitCode: result.exitCode, stdout: result.stdout.trim() }))
  }
  cleanup(snapshot)
} finally {
  rmSync(root, { recursive: true, force: true })
}
