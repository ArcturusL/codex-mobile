import { readdir, readFile, readlink, realpath, rm, stat, statfs } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const INSTALL_DIRECTORY = /^install-[a-zA-Z0-9]+$/
// A ~430 MiB runtime plus the download cache, extraction and headroom for other writers.
const MINIMUM_FREE_BYTES = 1024 ** 3

export async function readCodexSelection(root: string): Promise<{ directory?: string; previousDirectory?: string }> {
  try {
    const selection = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    if (!INSTALL_DIRECTORY.test(selection.directory)
      || (selection.previousDirectory !== undefined && !INSTALL_DIRECTORY.test(selection.previousDirectory))) {
      throw new Error('Invalid managed Codex selection; refusing to remove installations.')
    }
    return selection
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function runningInstallations(root: string): Promise<Set<string> | null> {
  // ponytail: /proc is our reliable process inventory; other platforms retain old installs until a native inventory is added.
  if (process.platform !== 'linux') return null
  const active = new Set<string>()
  const canonicalRoot = await realpath(root)
  async function protect(path: string) {
    const canonical = await realpath(path).catch(() => path)
    const directory = relative(canonicalRoot, canonical).split(sep)[0]!
    if (INSTALL_DIRECTORY.test(directory)) active.add(directory)
  }
  try {
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      const proc = join('/proc', entry)
      try {
        const args = (await readFile(join(proc, 'cmdline'), 'utf8')).split('\0')
        // Non-dumpable system services deny exe/cwd access even with readable argv.
        const link = (name: string) => readlink(join(proc, name)).catch(error => {
          if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error
          return ''
        })
        const cwd = await link('cwd')
        const exe = await link('exe')
        if (!cwd && args.some(arg => !isAbsolute(arg) && /codex/i.test(arg))) return null
        for (const path of [cwd, exe, ...args.filter(arg => isAbsolute(arg) || (cwd && arg.includes('/'))).map(arg => resolve(cwd, arg))]) {
          if (path) await protect(path)
        }
      } catch (error) {
        // Processes can exit during the scan. Any other inventory failure means retain everything.
        if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return null
      }
    }
    return active
  } catch { return null }
}

export async function cleanupCodexInstallations(root: string): Promise<void> {
  const selection = await readCodexSelection(root)
  const active = await runningInstallations(root)
  if (!active) return
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && INSTALL_DIRECTORY.test(entry.name))
  const keep = new Set([selection.directory, selection.previousDirectory, ...active])
  // Upgrade legacy manifests without losing their most recent rollback copy.
  if (!selection.previousDirectory) {
    const older = await Promise.all(entries.filter(entry => entry.name !== selection.directory)
      .map(async entry => ({ name: entry.name, modified: (await stat(join(root, entry.name))).mtimeMs })))
    older.sort((a, b) => b.modified - a.modified)
    if (older[0]) keep.add(older[0].name)
  }
  for (const entry of entries) {
    if (keep.has(entry.name)) continue
    // Do not remove anything if an external selector changed while the process inventory was being read.
    const current = await readCodexSelection(root)
    if (current.directory !== selection.directory || current.previousDirectory !== selection.previousDirectory) return
    await rm(join(root, entry.name), { recursive: true, force: true })
  }
}

export async function requireCodexUpdateSpace(root: string): Promise<void> {
  const { bavail, bsize } = await statfs(root)
  const available = bavail * bsize
  if (available < MINIMUM_FREE_BYTES) {
    throw new Error(`ENOSPC: Codex update needs at least 1024 MiB free before downloading; ${Math.floor(available / 1024 ** 2)} MiB available. Current, rollback and running versions were retained.`)
  }
}
