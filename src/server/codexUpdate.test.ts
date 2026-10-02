import { expect, test, vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createCodexUpdater, isNewerCodexVersion, describeCodexUpdateError } from './codexUpdate'
import { getManagedCodexCommand, resolveCodexCommand } from '../commandResolution'

const httpFetch = globalThis.fetch

test('stable updates compare numerically without downgrading newer builds', () => {
  expect(isNewerCodexVersion('0.154.0', '0.99.0')).toBe(true)
  expect(isNewerCodexVersion('0.153.4', '0.153.4-alpha.1')).toBe(true)
  expect(isNewerCodexVersion('0.153.4', '0.153.4+build.1')).toBe(false)
  expect(isNewerCodexVersion('0.153.4', '0.154.0-alpha.1')).toBe(false)
  expect(isNewerCodexVersion('0.154.0;touch /tmp/no', '0.153.4')).toBe(false)
  expect(isNewerCodexVersion('0.154.0', 'unknown')).toBe(false)
})

test('authenticated update flow caches checks, rejects CSRF, retries safely and persists the validated executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-updater-test-'))
  const previousEnv = { ...process.env }
  const bin = join(root, 'bin')
  await mkdir(bin)
  await writeFile(join(root, 'codex.cjs'), "console.log('codex-cli 0.153.4')")
  await writeFile(join(root, 'mode'), 'fail')
  await writeFile(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const root = process.env.CODEX_HOME;
fs.appendFileSync(path.join(root, 'installs'), '1');
const mode = fs.readFileSync(path.join(root, 'mode'), 'utf8');
if (mode === 'fail') process.exit(1);
if (mode === 'disk-full') { console.error('npm warn tar TAR_ENTRY_ERROR ENOSPC: no space left on device, write'); process.exit(0); }
if (!process.argv.includes('@openai/codex@latest') || !process.argv.includes('--prefer-online') || !process.argv.includes('--ignore-scripts')) process.exit(2);
const prefix = process.argv[process.argv.indexOf('--prefix') + 1];
const target = path.join(prefix, 'node_modules/@openai/codex/bin');
fs.mkdirSync(target, { recursive: true });
const version = mode === 'downgrade' ? '0.152.0' : '0.155.0';
fs.writeFileSync(path.join(target, '..', 'package.json'), JSON.stringify({ name: '@openai/codex', version }));
fs.writeFileSync(path.join(target, 'codex.js'), "console.log('codex-cli " + (mode === 'mismatch' ? '0.100.0' : version) + "')");
`, { mode: 0o755 })
  process.env.CODEX_HOME = root
  process.env.CODEXUI_CODEX_COMMAND = join(root, 'codex.cjs')
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`
  const registry = vi.fn(async () => new Response(JSON.stringify({ version: '0.154.0' })))
  vi.stubGlobal('fetch', registry)
  const intervalSpy = vi.spyOn(globalThis, 'setInterval')
  let updater = createCodexUpdater()
  const server = createServer((req, res) => {
    // Same placement as the packaged server: authenticate before the updater.
    if (req.headers.authorization !== 'Bearer test') { res.writeHead(401).end(); return }
    void updater.handle(req, res).then(handled => { if (!handled) res.writeHead(404).end() })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/codex-api/cli-update`
  const get = () => httpFetch(url, { headers: { Authorization: 'Bearer test' } })
  const update = (extra: Record<string, string> = {}) => httpFetch(url, {
    method: 'POST', headers: { Authorization: 'Bearer test', 'X-Codex-CLI-Action': 'update', ...extra },
  })
  async function settled() {
    for (let i = 0; i < 100; i++) {
      const status = await (await get()).json()
      if (!status.updating) return status
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Update did not settle')
  }
  try {
    expect((await httpFetch(url, { method: 'POST' })).status).toBe(401)
    expect((await update({ 'X-Codex-CLI-Action': '' })).status).toBe(403)
    expect((await update({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    const responses = await Promise.all(Array.from({ length: 10 }, get))
    expect((await responses[0]!.json()).currentVersion).toBe('0.153.4')
    expect(registry).toHaveBeenCalledTimes(1)
    expect(intervalSpy.mock.calls[0]![1]).toBe(6 * 60 * 60 * 1000)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 60 * 1000 - 1000)
    const scheduledCheck = intervalSpy.mock.calls[0]![0] as () => void
    scheduledCheck()
    await get()
    expect(registry).toHaveBeenCalledTimes(2)
    clock.mockRestore()
    expect((await update()).status).toBe(202)
    expect((await settled()).error).toMatch('update failed')
    expect(getManagedCodexCommand()).toBeNull()
    await writeFile(join(root, 'mode'), 'disk-full')
    expect((await update()).status).toBe(202)
    const diskFailure = await settled()
    expect(diskFailure.error).toContain('disk is full')
    expect(diskFailure.errorDetails).toContain('ENOSPC')
    expect(getManagedCodexCommand()).toBeNull()
    const later = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 12 * 60 * 60 * 1000)
    scheduledCheck()
    expect(await (await get()).json()).toMatchObject({ error: diskFailure.error, errorDetails: diskFailure.errorDetails })
    later.mockRestore()
    await writeFile(join(root, 'mode'), 'mismatch')
    expect((await update()).status).toBe(202)
    expect((await settled()).error).toMatch('did not match')
    expect(resolveCodexCommand()).toBe(join(root, 'codex.cjs'))
    await writeFile(join(root, 'mode'), 'downgrade')
    expect((await update()).status).toBe(202)
    expect((await settled()).error).toMatch('did not match')
    expect(getManagedCodexCommand()).toBeNull()
    await writeFile(join(root, 'mode'), 'success')
    await Promise.all(Array.from({ length: 8 }, () => update()))
    const complete = await settled()
    expect(complete).toMatchObject({ currentVersion: '0.155.0', latestVersion: '0.155.0', updating: false, updateAvailable: false, restartRequired: true, error: null })
    expect(await readFile(join(root, 'installs'), 'utf8')).toBe('11111')
    expect(resolveCodexCommand()).toBe(getManagedCodexCommand())
    updater.dispose()
    updater = createCodexUpdater()
    expect(await (await get()).json()).toMatchObject({ currentVersion: '0.155.0', restartRequired: false })
    expect((await update()).status).toBe(409)
    registry.mockRejectedValueOnce(new Error('registry offline'))
    updater.dispose()
    updater = createCodexUpdater()
    expect(await (await get()).json()).toMatchObject({ currentVersion: '0.155.0', latestVersion: null, error: 'registry offline' })
  } finally {
    updater.dispose()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    process.env = previousEnv
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  }
})


test('update diagnostics classify missing binaries and redact credentials with bounded output', () => {
  expect(describeCodexUpdateError(new Error('Missing optional dependency @openai/codex-linux-x64')).error).toContain('platform package is missing')
  const result = describeCodexUpdateError({ stderr: 'ENOSPC https://user:secret@example.test _authToken=secret Bearer secret', stdout: 'x'.repeat(20_000) })
  expect(result.error).toContain('disk is full')
  expect(result.errorDetails).not.toContain('secret')
  expect(result.errorDetails.length).toBeLessThan(16_100)
  expect(result.errorDetails).toContain('[truncated]')
})
