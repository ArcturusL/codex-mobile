import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { handleSkillsRoutes, initializeSkillsSyncOnStartup } from './skillsRoutes'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => { throw new Error('Startup must not run external commands without skills sync login') }),
}))

it('keeps unauthenticated startup local even when retired mobile environment markers are present', async () => {
  const codexHome = await mkdtemp(join(tmpdir(), 'codex-desktop-skills-'))
  const fetchMock = vi.fn(() => { throw new Error('Startup must not fetch remote skills without login') })
  vi.stubEnv('CODEX_HOME', codexHome)
  vi.stubEnv('TERMUX_VERSION', 'retired-platform')
  vi.stubEnv('PREFIX', '/retired/com.termux/files/usr')
  vi.stubEnv('PROOT_TMP_DIR', '/retired/proot')
  vi.stubGlobal('fetch', fetchMock)
  try {
    await writeFile(join(codexHome, 'AGENTS.md'), 'Keep local instructions\n')
    const appServer = { rpc: vi.fn() }
    await initializeSkillsSyncOnStartup(appServer)

    expect(await readFile(join(codexHome, 'skills', 'AGENTS.md'), 'utf8')).toBe('Keep local instructions\n')
    expect(await readlink(join(codexHome, 'AGENTS.md'))).toBe(join('skills', 'AGENTS.md'))
    expect(spawn).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(appServer.rpc).not.toHaveBeenCalled()

    const end = vi.fn()
    const response = { setHeader: vi.fn(), end } as unknown as ServerResponse
    await handleSkillsRoutes(
      { method: 'GET' } as IncomingMessage,
      response,
      new URL('http://localhost/codex-api/skills-sync/status'),
      { appServer, readJsonBody: vi.fn() },
    )
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(end.mock.calls[0]?.[0]).data.startup).toMatchObject({
      inProgress: false,
      mode: 'idle',
      lastAction: 'skip-upstream-without-login',
      lastError: '',
    })
  } finally {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    await rm(codexHome, { recursive: true, force: true })
  }
})
