import { afterEach, expect, test, vi } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupCodexInstallations, requireCodexUpdateSpace } from './codexUpdateStorage'

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }))

let root: string
let child: ChildProcess | undefined
afterEach(async () => {
  child?.kill()
  child = undefined
  vi.restoreAllMocks()
  if (root) await fs.rm(root, { recursive: true, force: true })
})

test.runIf(process.platform === 'linux')('cleanup retains selected, rollback and a live runtime, then removes it after exit', async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'codex-storage-'))
  for (const directory of ['install-current', 'install-previous', 'install-running', 'install-obsolete', 'unrelated']) {
    await fs.mkdir(join(root, directory))
    await fs.writeFile(join(root, directory, 'keep'), 'data')
  }
  await fs.symlink(join(root, 'unrelated'), join(root, 'install-symlink'))
  await fs.writeFile(join(root, 'current.json'), JSON.stringify({ directory: 'install-current', previousDirectory: 'install-previous' }))
  const script = join(root, 'install-running', 'hold.cjs')
  await fs.writeFile(script, 'process.stdout.write("ready"); setInterval(() => {}, 1000)')
  // A symlinked executable argument must protect its real installation, too.
  const alias = join(root, 'alias.cjs')
  await fs.symlink(script, alias)
  child = spawn(process.execPath, [alias], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => { child!.stdout!.once('data', () => resolve()); child!.once('error', reject) })
  await cleanupCodexInstallations(root)
  expect(await fs.readdir(root)).toEqual(expect.arrayContaining(['install-current', 'install-previous', 'install-running', 'install-symlink', 'unrelated']))
  await expect(fs.stat(join(root, 'install-obsolete'))).rejects.toMatchObject({ code: 'ENOENT' })
  const exited = new Promise(resolve => child!.once('exit', resolve))
  child.kill()
  await exited
  child = undefined
  await cleanupCodexInstallations(root)
  await expect(fs.stat(join(root, 'install-running'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await fs.readFile(join(root, 'unrelated', 'keep'), 'utf8')).toBe('data')
  // Legacy selectors still keep one rollback; unreadable process inventories must fail closed.
  await fs.writeFile(join(root, 'current.json'), '{"directory":"install-current"}')
  await fs.mkdir(join(root, 'install-stale'))
  await fs.utimes(join(root, 'install-stale'), 1, 1)
  const read = fs.readFile
  const unreadable = vi.spyOn(fs, 'readFile').mockImplementation((...args: Parameters<typeof fs.readFile>) => {
    if (String(args[0]).startsWith('/proc/')) return Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' }))
    return read(...args)
  })
  await cleanupCodexInstallations(root)
  expect(await fs.readdir(root)).toContain('install-stale')
  unreadable.mockRestore()
  await cleanupCodexInstallations(root)
  expect(await fs.readdir(root)).toContain('install-previous')
  await expect(fs.stat(join(root, 'install-stale'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('low-space preflight reports available bytes and invalid selectors never delete installs', async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'codex-storage-'))
  vi.spyOn(fs, 'statfs').mockResolvedValue({ bavail: 256, bsize: 1024 ** 2 } as Awaited<ReturnType<typeof fs.statfs>>)
  await expect(requireCodexUpdateSpace(root)).rejects.toThrow('256 MiB available')
  await fs.mkdir(join(root, 'install-keep'))
  await fs.writeFile(join(root, 'current.json'), '{"directory":"../outside"}')
  await expect(cleanupCodexInstallations(root)).rejects.toThrow('Invalid managed Codex selection')
  expect(await fs.readdir(root)).toContain('install-keep')
})
