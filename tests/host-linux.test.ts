import { test, expect } from 'claude-code/testing'
// @ts-expect-error the pure sandbox helper is plain ESM without a declaration file
import { containerSandboxArgv, linuxBwrapArgv } from '../scripts/linux-sandbox.mjs'

test('the Linux probe backend isolates network, root filesystem and cwd', async () => {
  const argv = linuxBwrapArgv('/tmp/dss-evidence/work', 'echo ok', '/usr/bin/bwrap', '/usr/bin:/bin')
  expect(argv[0]).toBe('/usr/bin/bwrap')
  expect(argv).toContain('--unshare-all')
  expect(argv).toContain('--die-with-parent')
  expect(argv).toContain('--ro-bind')
  expect(argv).toContain('--bind')
  expect(argv).toContain('--clearenv')
  expect(argv).toContain('/usr')
  expect(argv).not.toContain('/home')
  expect(argv.join(' ')).toContain('-- /bin/bash --noprofile --norc -c echo ok')
})

test('the opt-in container fallback is offline, read-only and mounts only the copy', async () => {
  const argv = containerSandboxArgv('/tmp/dss-evidence/work', 'echo ok', '/usr/bin/docker', 'debian:bookworm-slim', 1000, 1000)
  expect(argv).toContain('--network')
  expect(argv).toContain('none')
  expect(argv).toContain('--read-only')
  expect(argv).toContain('--cap-drop')
  expect(argv).toContain('--security-opt')
  expect(argv).toContain('no-new-privileges')
  expect(argv.join(' ')).toContain('type=bind,src=/tmp/dss-evidence/work,dst=/work')
  expect(argv).toContain('1000:1000')
})
