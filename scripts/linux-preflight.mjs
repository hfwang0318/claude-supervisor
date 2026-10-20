// Read-only Linux capability report for the probe isolation backend.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const which = name => ['/usr/bin', '/bin', '/usr/local/bin'].map(d => `${d}/${name}`).find(existsSync) ?? ''
const read = path => { try { return readFileSync(path, 'utf8').trim() } catch { return null } }
const canRun = (binary, args) => { try { execFileSync(binary, args, { stdio: 'ignore', timeout: 2000 }); return true } catch { return false } }

const bwrap = which('bwrap')
const docker = which('docker')
const podman = which('podman')
const bwrapUsable = bwrap ? canRun(bwrap, ['--ro-bind', '/', '/', '--unshare-all', '--', '/bin/true']) : false
const report = {
  platform: process.platform,
  arch: process.arch,
  bwrap: bwrap || null,
  bwrapSetuid: bwrap ? (statSync(bwrap).mode & 0o4000) !== 0 : false,
  bwrapUsable,
  userNamespaces: read('/proc/sys/kernel/unprivileged_userns_clone'),
  maxUserNamespaces: read('/proc/sys/user/max_user_namespaces'),
  docker: docker || null,
  podman: podman || null,
  backend: bwrapUsable ? 'bubblewrap' : 'read-only',
  fallbackAvailable: Boolean(docker || podman)
}
console.log(JSON.stringify(report, null, 2))
if (!bwrapUsable) process.exitCode = 1
