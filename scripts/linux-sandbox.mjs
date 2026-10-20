// Pure argument builder for the bubblewrap probe backend. No host imports, so
// the plugin test runner can load it without granting a hooks module Node APIs.
// Only explicit system paths are visible; the user's home and the real workspace
// are not mounted. The owned copy is the only writable tree (plus /tmp).
export const linuxBwrapArgv = (root, command, binary, path, systemPaths = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc']) => [
  binary,
  '--die-with-parent',
  '--unshare-all',
  '--new-session',
  ...systemPaths.flatMap(directory => ['--ro-bind', directory, directory]),
  '--tmpfs', '/tmp',
  '--bind', root, root,
  '--proc', '/proc',
  '--dev', '/dev',
  '--chdir', root,
  '--clearenv',
  '--setenv', 'PATH', path,
  '--setenv', 'HOME', root,
  '--setenv', 'TMPDIR', root,
  '--setenv', 'LANG', 'en_US.UTF-8',
  '--setenv', 'OPENSSL_CONF', '/dev/null',
  '--', '/bin/bash', '--noprofile', '--norc', '-c', command
]

// Opt-in container fallback. The image must exist locally; the caller decides
// whether invoking the container engine is acceptable.
export const containerSandboxArgv = (root, command, engine, image, uid, gid) => [
  engine,
  'run', '--rm',
  '--network', 'none',
  '--read-only',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
  '--mount', `type=bind,src=${root},dst=/work`,
  '--workdir', '/work',
  '--user', `${uid}:${gid}`,
  '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges',
  '--pids-limit', '64',
  '--memory', '512m',
  '--env', 'HOME=/work',
  '--env', 'TMPDIR=/work',
  '--env', 'PATH=/usr/local/bin:/usr/bin:/bin',
  '--entrypoint', '/bin/bash',
  image,
  '--noprofile', '--norc', '-c', command
]
