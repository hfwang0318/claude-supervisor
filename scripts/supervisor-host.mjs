// Trusted, model-free local service. Requests are argv/stdin data, never shell code.
import { inspectFacts, validateFacts } from './inspect-facts.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { linuxBwrapArgv } from './linux-sandbox.mjs'

const MAX_BYTES = 50 * 1024 * 1024
const MAX_FILES = 10000
const OUTPUT_BYTES = 1024 * 1024
const secret = /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|id_rsa|credentials(?:\..*)?)$|\.(?:pem|key)$/i
const bwrapPath = () => ['/usr/bin/bwrap', '/bin/bwrap', '/usr/local/bin/bwrap'].find(existsSync) ?? ''
let bwrapChecked = false
let bwrapOK = false
const bwrapWorks = () => {
  if (bwrapChecked) return bwrapOK
  bwrapChecked = true
  const binary = bwrapPath()
  if (!binary) return bwrapOK = false
  try {
    execFileSync(binary, ['--ro-bind', '/', '/', '--unshare-all', '--', '/bin/true'], { stdio: 'ignore', timeout: 1500 })
    return bwrapOK = true
  } catch { return bwrapOK = false }
}
const isolationBackend = () => process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec') ? 'sandbox-exec' : process.platform === 'linux' && bwrapWorks() ? 'bwrap' : null
const ignored = name => name === '.git' || name === '.superpowers'
const inside = (root, path) => path === root || (!isAbsolute(relative(root, path)) && !relative(root, path).startsWith('..'))
const alive = deadline => { if (!Number.isFinite(deadline) || Date.now() >= deadline) throw Error('deadline exhausted') }

// Metadata only: canonical worktree and git-directory identity. No shell,
// candidate command, repository config mutation or prefix-based identity guess.
export const workspaceIdentity = (cwd, deadlineMs) => {
  try {
    alive(deadlineMs)
    if (typeof cwd !== 'string' || !isAbsolute(cwd) || cwd.length > 4096 || /[\0\r\n]/.test(cwd)) return null
    cwd = realpathSync(cwd)
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
    const query = flag => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'core.fsmonitor=false', 'rev-parse', flag], { encoding: 'utf8', timeout: Math.max(1, Math.min(1000, deadlineMs - Date.now())), maxBuffer: 8192, env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const root = realpathSync(query('--show-toplevel'))
    const gitDirectory = realpathSync(query('--absolute-git-dir'))
    alive(deadlineMs)
    if (root === '/' || !inside(root, cwd) || /[\0\r\n]/.test(root + gitDirectory)) return null
    return { root, gitDirectory }
  } catch { return null }
}

export const manifest = (root, deadlineMs) => {
  alive(deadlineMs)
  root = realpathSync(root)
  if (root === '/' || root === realpathSync(homedir())) throw Error('unsupported workspace root')
  let files = 0
  let bytes = 0
  const entries = []
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      alive(deadlineMs)
      if (ignored(name)) continue
      if (secret.test(name)) throw Error('workspace contains a secret path; independent execution unsupported')
      const path = join(dir, name)
      const stat = lstatSync(path)
      if (++files > MAX_FILES) throw Error('manifest file limit')
      const rel = relative(root, path)
      if (stat.isSymbolicLink()) throw Error('symlink workspace unsupported')
      if (stat.isDirectory()) { entries.push([rel, 'dir', stat.mode & 511]); walk(path) }
      else if (stat.isFile()) {
        bytes += stat.size
        if (bytes > MAX_BYTES) throw Error('manifest byte limit')
        const content = readFileSync(path)
        entries.push([rel, 'file', stat.mode & 511, createHash('sha256').update(content).digest('hex')])
      } else throw Error('special file workspace unsupported')
    }
  }
  walk(root)
  alive(deadlineMs)
  return { hash: createHash('sha256').update(JSON.stringify(entries)).digest('hex'), entries, bytes, files }
}

const ownerOf = snapshot => {
  const root = resolve(snapshot.root)
  const parent = dirname(root)
  if (dirname(parent) !== realpathSync(tmpdir()) || !/^dss-evidence-[A-Za-z0-9]+$/.test(parent.split('/').at(-1)) || root !== join(parent, 'work')) throw Error('unowned snapshot path')
  if (lstatSync(parent).isSymbolicLink() || lstatSync(root).isSymbolicLink()) throw Error('snapshot ownership symlink')
  const owner = JSON.parse(readFileSync(join(parent, 'owner.json'), 'utf8'))
  if (owner.schemaVersion !== 1 || owner.id !== snapshot.id || owner.root !== root || owner.sourceManifestHash !== snapshot.sourceManifestHash || JSON.stringify(owner.binding) !== JSON.stringify(snapshot.binding)) throw Error('snapshot ownership mismatch')
  return { parent, owner }
}

export const capture = (binding, source, deadlineMs) => {
  const root = realpathSync(source)
  const before = manifest(root, deadlineMs)
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'dss-evidence-'))
  try {
    const copy = join(parent, 'work')
    cpSync(root, copy, { recursive: true, dereference: false, preserveTimestamps: true, filter: path => !ignored(path.split('/').at(-1)) })
    const after = manifest(root, deadlineMs)
    const copied = manifest(copy, deadlineMs)
    if (before.hash !== after.hash || before.hash !== copied.hash) throw Error('workspace changed during capture')
    const id = randomUUID()
    const bound = { ...binding, workspaceRevision: before.hash, snapshotId: id }
    const snapshot = { id, binding: bound, root: copy, sourceManifestHash: before.hash, isolation: isolationBackend() === null ? 'read-only' : 'boxed-copy' }
    writeFileSync(join(parent, 'owner.json'), JSON.stringify({ schemaVersion: 1, ...snapshot, source: root, entries: before.entries }), { mode: 0o600, flag: 'wx' })
    return snapshot
  } catch (err) { rmSync(parent, { recursive: true, force: true }); throw err }
}

export const cleanup = snapshot => {
  const { parent } = ownerOf(snapshot)
  rmSync(parent, { recursive: true })
}

// Resolve only the active Node executable's dynamic libraries, not whole home or
// Homebrew directories. Unknown @rpath layouts disable that runtime.
const runtimeFiles = () => {
  const executable = realpathSync(process.execPath)
  const files = new Set([executable])
  const queue = [executable]
  while (queue.length) {
    const path = queue.shift()
    const output = execFileSync('/usr/bin/otool', ['-L', path], { encoding: 'utf8', timeout: 1000, maxBuffer: 65536 })
    for (const line of output.split('\n').slice(1)) {
      const lib = line.trim().split(' (')[0]
      if (!lib || lib.startsWith('/usr/lib/') || lib.startsWith('/System/')) continue
      let target = lib
      if (lib.startsWith('@rpath/')) target = [join(dirname(path), lib.slice(7)), join(dirname(executable), '../lib', lib.slice(7))].find(existsSync) ?? ''
      else if (lib.startsWith('@loader_path/')) target = join(dirname(path), lib.slice(13))
      if (!isAbsolute(target) || !existsSync(target)) throw Error(`unsupported runtime library layout: ${lib}`)
      const canonical = realpathSync(target)
      files.add(target)
      if (!files.has(canonical)) { files.add(canonical); queue.push(canonical) }
      if (files.size > 128) throw Error('runtime library limit')
    }
  }
  return [...files]
}

export const sandboxProfile = root => [
  '(version 1)(deny default)',
  '(allow process*)(allow sysctl-read)(allow mach-lookup)(allow file-read-metadata)(allow file-read* (literal "/"))',
  '(allow file-read* (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/System") (subpath "/Library/Developer") (subpath "/Library/Apple"))',
  `(allow file-read* ${runtimeFiles().map(path => `(literal ${JSON.stringify(path)})`).join(' ')} (subpath ${JSON.stringify(root)}))`,
  `(allow file-write* (subpath ${JSON.stringify(root)}))`,
  '(allow file-read* file-write* (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))'
].join('')

export const execute = async (snapshot, command, files, deadlineMs) => {
  const { owner } = ownerOf(snapshot)
  alive(deadlineMs)
  if (snapshot.isolation !== 'boxed-copy') throw Error('execution isolation unavailable')
  const backend = isolationBackend()
  if (backend === null) throw Error('execution isolation unavailable')
  if (typeof command !== 'string' || Buffer.byteLength(command) > 4096 || !command.trim()) throw Error('command protocol limit')
  if (!Array.isArray(files) || files.length > 3 || files.reduce((n, f) => n + Buffer.byteLength(f.content ?? ''), 0) > 65536) throw Error('probe files protocol limit')
  if (manifest(owner.source, deadlineMs).hash !== owner.sourceManifestHash || manifest(snapshot.root, deadlineMs).hash !== owner.sourceManifestHash) throw Error('stale workspace before execution')
  for (const file of files) {
    if (typeof file.path !== 'string' || typeof file.content !== 'string' || !file.path.startsWith('__supervisor_probes/') || file.path.split('/').some(s => s === '..' || s === '.') || isAbsolute(file.path)) throw Error('probe file path rejected')
    const path = resolve(snapshot.root, file.path)
    if (!inside(snapshot.root, path) || existsSync(path)) throw Error('probe may not replace an existing file')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content, { flag: 'wx', mode: 0o600 })
  }
  const startedAt = Date.now()
  const env = { PATH: `/usr/bin:/bin:/usr/sbin:/sbin:${dirname(realpathSync(process.execPath))}`, HOME: snapshot.root, TMPDIR: snapshot.root, LANG: 'en_US.UTF-8', OPENSSL_CONF: '/dev/null' }
  const [binary, ...args] = backend === 'sandbox-exec' ? ['/usr/bin/sandbox-exec', '-p', sandboxProfile(snapshot.root), '/bin/bash', '--noprofile', '--norc', '-c', command] : linuxBwrapArgv(snapshot.root, command, bwrapPath(), env.PATH, ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc'].filter(existsSync))
  const child = spawn(binary, args, { cwd: snapshot.root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let bytes = 0
  let truncated = false
  let stdout = ''
  let stderr = ''
  let cancelled = false
  const retain = (stream, chunk) => {
    const available = Math.max(0, OUTPUT_BYTES - bytes)
    const kept = chunk.subarray(0, available)
    bytes += kept.length
    if (kept.length < chunk.length) truncated = true
    if (stream === 'stdout') stdout += kept.toString('utf8')
    else stderr += kept.toString('utf8')
  }
  child.stdout.on('data', chunk => retain('stdout', chunk))
  child.stderr.on('data', chunk => retain('stderr', chunk))
  const stop = () => { cancelled = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  const timer = setTimeout(stop, Math.max(1, deadlineMs - Date.now() - 100))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  let exitCode
  try { exitCode = await new Promise((ok, reject) => { child.once('error', reject); child.once('close', code => ok(code)) }) }
  finally {
    clearTimeout(timer)
    process.removeListener('SIGTERM', stop)
    process.removeListener('SIGINT', stop)
    // Detached descendants cannot live beyond a completed probe.
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
  }
  let current = false
  let unchanged = false
  try {
    current = manifest(owner.source, deadlineMs).hash === owner.sourceManifestHash
    const after = manifest(snapshot.root, deadlineMs)
    const byPath = new Map(after.entries.map(entry => [entry[0], entry]))
    unchanged = owner.entries.every(entry => JSON.stringify(byPath.get(entry[0])) === JSON.stringify(entry))
  } catch {}
  return { exitCode, stdout, stderr, truncated, startedAt, endedAt: Date.now(), cancelled, current, unchanged }
}

export const handle = async request => {
  if (request.action === 'workspace-identity') return workspaceIdentity(request.root, request.deadlineMs)
  if (request.action === 'inspect') return inspectFacts(request.root, request.request, request.deadlineMs, { filesOnly: request.filesOnly === true })
  if (request.action === 'validate-facts') return validateFacts(request.root, request.view, request.deadlineMs)
  if (request.action === 'manifest') return manifest(request.root, request.deadlineMs)
  if (request.action === 'capture') return capture(request.binding, request.root, request.deadlineMs)
  if (request.action === 'cleanup') { cleanup(request.snapshot); return { cleaned: true } }
  if (request.action === 'execute') return execute(request.snapshot, request.command, request.files ?? [], request.deadlineMs)
  throw Error('unknown host action')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const input = readFileSync(0, 'utf8')
    if (Buffer.byteLength(input) > 128 * 1024) throw Error('host request limit')
    console.log(JSON.stringify(await handle(JSON.parse(input))))
  } catch (error) { console.log(JSON.stringify({ error: String(error.message) })); process.exitCode = 1 }
}
