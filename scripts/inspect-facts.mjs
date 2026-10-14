// Read-only source inspection. Never imports project code or starts a shell.
import { createHash } from 'node:crypto'
import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

const hash = value => createHash('sha256').update(value).digest('hex')
const secretPath = /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|id_rsa|credentials(?:\..*)?)$|\.(?:pem|key)$/i
const ignored = name => ['.git', '.superpowers', 'node_modules'].includes(name)
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 512 && !isAbsolute(path) && !/[\\\x00-\x1f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..' && !secretPath.test(part) && !ignored(part))
const validTerms = terms => Array.isArray(terms) && terms.length <= 2 && terms.every(t => typeof t === 'string' && t.trim() && Buffer.byteLength(t) <= 128 && !/[\x00-\x1f]/.test(t))
const validScope = scope => scope && Object.keys(scope).every(k => ['paths', 'terms'].includes(k)) && Array.isArray(scope.paths) && scope.paths.length > 0 && scope.paths.length <= 6 && scope.paths.every(safePath) && validTerms(scope.terms) && scope.terms.length > 0
const validRequest = r => r && Object.keys(r).every(k => ['paths', 'terms', 'searchPaths'].includes(k)) && Array.isArray(r.paths) && r.paths.length <= 6 && r.paths.every(safePath) && validTerms(r.terms) && r.paths.length + r.terms.length > 0 && (r.searchPaths === undefined || validScope({ paths: r.searchPaths, terms: r.terms }))
const secretContent = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|rk|pk)-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{20,})|\bxox[abprs]-[\w-]{10,}|\bAIza[0-9A-Za-z_-]{35}|\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|(?:api[_-]?key|secret|token|password|passwd|auth)[\w-]*["']?\s*[:=]\s*["']?[^\s"',;]{6,}/i
const empty = () => ({ facts: [], files: [], manifestHash: '', incomplete: true })
const alive = deadline => { if (!Number.isFinite(deadline) || Date.now() >= deadline) throw Error('deadline') }
const identity = stat => `${stat.dev}/${stat.ino}/${stat.size}/${stat.mtimeMs}/${stat.ctimeMs}`
const checkedPath = (root, path, deadline) => {
  if (!safePath(path)) throw Error('unsafe path')
  let current = root
  for (const part of path.split('/')) {
    alive(deadline)
    current = join(current, part)
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) throw Error('symlink')
    if (current !== join(root, path) && !stat.isDirectory()) throw Error('non-directory ancestor')
  }
  if (realpathSync(current) !== current) throw Error('changed ancestor')
  return current
}
const read = (root, path, deadline, budget) => {
  const full = checkedPath(root, path, deadline)
  const before = lstatSync(full)
  if (!before.isFile() || before.size > 256 * 1024) throw Error('file limit/type')
  if (budget.bytes + before.size > 2 * 1024 * 1024) throw Error('read limit')
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    // Check the opened inode before reading: an ancestor swap cannot redirect reads.
    if (identity(fstatSync(fd)) !== identity(before) || checkedPath(root, path, deadline) !== full || identity(lstatSync(full)) !== identity(before)) throw Error('changed before read')
    const content = readFileSync(fd)
    budget.bytes += content.length
    if (content.length !== before.size || budget.bytes > 2 * 1024 * 1024 || identity(fstatSync(fd)) !== identity(before) || identity(lstatSync(checkedPath(root, path, deadline))) !== identity(before)) throw Error('changed during read')
    alive(deadline)
    budget.versions ??= new Map()
    const previous = budget.versions.get(path)
    if (previous && previous !== identity(before)) throw Error('source changed across reads')
    budget.versions.set(path, identity(before))
    return content
  } finally { closeSync(fd) }
}
const directorySnapshot = (root, path, deadline) => {
  const full = checkedPath(root, path, deadline), before = lstatSync(full)
  if (!before.isDirectory()) throw Error('changed directory')
  const names = readdirSync(full).filter(name => !ignored(name) && !secretPath.test(name)).sort()
  if (identity(lstatSync(checkedPath(root, path, deadline))) !== identity(before)) throw Error('changed directory members')
  return { names, entriesHash: hash(JSON.stringify(names)), version: identity(before) }
}
const viewHash = (files, searchScope, directories) => hash(JSON.stringify(searchScope ? { files, searchScope, directories } : files))
export const validateFacts = (source, view, deadlineMs, budget = { bytes: 0 }) => {
  try {
    alive(deadlineMs)
    if (!view || view.incomplete !== false || !Array.isArray(view.files) || view.files.length < 1 || view.files.length > 200 || !Array.isArray(view.facts) || view.searchScope !== undefined && (!validScope(view.searchScope) || !Array.isArray(view.directories) || view.directories.length > 200) || Buffer.byteLength(JSON.stringify(view)) > 32768 || viewHash(view.files, view.searchScope, view.directories) !== view.manifestHash) return false
    const root = realpathSync(source)
    const contents = new Map()
    for (const file of view.files) {
      if (contents.has(file.path) || !/^[a-f0-9]{64}$/.test(file.fileHash)) return false
      const content = read(root, file.path, deadlineMs, budget)
      if (hash(content) !== file.fileHash) return false
      contents.set(file.path, content.toString('utf8'))
    }
    const factsMatch = view.facts.length > 0 && view.facts.every(f => {
      const text = contents.get(f.path)
      return text !== undefined && Number.isSafeInteger(f.startLine) && f.startLine > 0 && f.quote && !secretContent.test(f.quote) && text.split('\n')[f.startLine - 1] === f.quote && f.fileHash === view.files.find(file => file.path === f.path)?.fileHash && f.id === hash(`${f.path}\n${f.startLine}\n${f.quote}\n${f.fileHash}`)
    })
    // A source read early must still match after all later reads. No cached
    // content alone certifies an entire group of sources.
    const uniqueDirs = new Set()
    const directoriesMatch = !view.searchScope || view.directories.every(dir => {
      if (uniqueDirs.has(dir.path) || !/^[a-f0-9]{64}$/.test(dir.entriesHash)) return false
      uniqueDirs.add(dir.path)
      const current = directorySnapshot(root, dir.path, deadlineMs)
      return current.entriesHash === dir.entriesHash && current.version === dir.version
    })
    return factsMatch && directoriesMatch && [...budget.versions].every(([path, version]) => identity(lstatSync(checkedPath(root, path, deadlineMs))) === version)
  } catch { return false }
}
export const inspectFacts = (source, request, deadlineMs) => {
  try {
    alive(deadlineMs)
    if (!validRequest(request)) return empty()
    const root = realpathSync(source)
    const budget = { bytes: 0 }
    const scanned = new Map()
    const selected = new Map()
    const directories = []
    const load = path => {
      if (!scanned.has(path)) {
        if (scanned.size >= 200) throw Error('file count')
        const content = read(root, path, deadlineMs, budget)
        scanned.set(path, { text: content.toString('utf8'), fileHash: hash(content) })
      }
      return scanned.get(path)
    }
    for (const path of request.paths) selected.set(path, load(path).text.split('\n').map((_, n) => n))
    const visited = new Set()
    if (request.terms.length) {
      const visit = path => {
        if (visited.has(path)) return
        visited.add(path)
        if (visited.size > 200) throw Error('visit limit')
        const full = checkedPath(root, path, deadlineMs)
        const stat = lstatSync(full)
        if (stat.isDirectory()) walk(full, path + '/')
        else if (stat.isFile()) {
          const { text } = load(path)
          if (text.includes('\0')) return
          const lines = text.split('\n')
          const indexes = lines.flatMap((line, n) => request.terms.some(t => line.includes(t)) ? [n] : [])
          if (indexes.length && !selected.has(path)) selected.set(path, indexes)
        } else throw Error('special source')
      }
      const walk = (dir, prefix = '') => {
        let names
        if (request.searchPaths) {
          const path = prefix.slice(0, -1), snapshot = directorySnapshot(root, path, deadlineMs)
          directories.push({ path, entriesHash: snapshot.entriesHash, version: snapshot.version })
          names = snapshot.names
        } else names = readdirSync(dir).sort()
        for (const name of names) {
          alive(deadlineMs)
          if (ignored(name) || secretPath.test(name)) continue
          visit(prefix + name)
        }
      }
      if (request.searchPaths) for (const path of request.searchPaths) visit(path)
      else walk(root)
    }
    if (selected.size > 6) return empty()
    const facts = []
    for (const [path, indexes] of selected) {
      const { text, fileHash } = scanned.get(path)
      for (const n of indexes) {
        const quote = text.split('\n')[n]
        if (!quote.trim()) continue
        if (secretContent.test(quote) || quote.includes('\0')) return empty()
        const startLine = n + 1
        facts.push({ id: hash(`${path}\n${startLine}\n${quote}\n${fileHash}`), path, startLine, quote, fileHash })
      }
    }
    const files = [...scanned].map(([path, value]) => ({ path, fileHash: value.fileHash }))
    const searchScope = request.searchPaths ? { paths: [...new Set(request.searchPaths)], terms: [...new Set(request.terms)] } : undefined
    const view = { facts, files, manifestHash: viewHash(files, searchScope, searchScope ? directories : undefined), incomplete: false, ...(searchScope ? { searchScope, directories } : {}) }
    if (!validateFacts(root, view, deadlineMs, budget)) return empty()
    return view
  } catch { return empty() }
}
