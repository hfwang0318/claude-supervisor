import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { handle } from './supervisor-host.mjs'
const temp = mkdtempSync(join(tmpdir(), 'dss-worktree-identity-'))
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] })
const identity = root => handle({ action: 'workspace-identity', root, deadlineMs: Date.now() + 5000 })
try {
  const repo = join(temp, 'repo'), sub = join(repo, 'packages/mail'), nested = join(repo, 'nested'), other = join(temp, 'other'), linked = join(temp, 'linked'), plain = join(temp, 'plain')
  for (const p of [sub, nested, other, plain]) mkdirSync(p, { recursive: true })
  for (const p of [repo, other]) git(p, 'init', '-q')
  const root = await identity(repo)
  assert.ok(root && root.root.endsWith('/repo') && root.gitDirectory.endsWith('/repo/.git'))
  assert.deepEqual(await identity(sub), root, 'ordinary navigation shares verified worktree identity')
  const previousGitDir = process.env.GIT_DIR
  try { process.env.GIT_DIR = join(other, '.git'); assert.deepEqual(await identity(sub), root, 'ambient Git overrides cannot supply a different project identity') }
  finally { if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir }
  const shim = join(temp, 'shim'); mkdirSync(shim); writeFileSync(join(shim, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const previousPath = process.env.PATH
  try { process.env.PATH = shim; assert.deepEqual(await identity(sub), root, 'metadata lookup must not execute a project-provided git from PATH') }
  finally { if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath }
  git(nested, 'init', '-q')
  assert.notDeepEqual(await identity(nested), root, 'a nested repository is a real boundary')
  assert.notDeepEqual(await identity(other), root, 'a separate repository is a real boundary')
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture')
  git(repo, 'worktree', 'add', '-qb', 'linked', linked)
  const worktree = await identity(linked)
  assert.notDeepEqual(worktree, root, 'linked worktrees must not share an advisory lifetime')
  assert.notEqual(worktree.gitDirectory, root.gitDirectory)
  symlinkSync(repo, join(temp, 'alias'))
  assert.deepEqual(await identity(join(temp, 'alias/packages/mail')), root, 'canonical identity resolves an alias without prefix guessing')
  assert.equal(await identity(plain), null)
  assert.equal(await identity(join(temp, 'absent')), null)
  assert.equal(await handle({ action: 'workspace-identity', root: repo, deadlineMs: Date.now() - 1 }), null)
  assert.equal(await identity('relative'), null)
  console.log('Real workspace identity: same root/subdir/alias, nested/other/linked boundaries, unknown/deadline rejection passed; no model or candidate commands.')
} finally { rmSync(temp, { recursive: true, force: true }) }
