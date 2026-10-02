import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createCodexBridgeMiddleware } from './codexAppServerBridge'

vi.mock('./skillsRoutes.js', () => ({
  initializeSkillsSyncOnStartup: vi.fn(async () => {}),
  handleSkillsRoutes: vi.fn(async () => false),
}))

it('leaves retired Telegram routes unhandled and preserves legacy configuration', async () => {
  const codexHome = await mkdtemp(join(tmpdir(), 'codexui-removed-integrations-'))
  const configPath = join(codexHome, 'telegram-bridge.json')
  const legacyConfig = JSON.stringify({ botToken: 'fake-token', chatIds: [123], allowedUserIds: [123] })
  await writeFile(configPath, legacyConfig)
  vi.stubEnv('CODEX_HOME', codexHome)
  vi.stubGlobal('__codexRemoteSharedBridge__', undefined)
  const fetchMock = vi.fn(async () => { throw new Error('Unexpected outbound request') })
  vi.stubGlobal('fetch', fetchMock)
  const bridge = createCodexBridgeMiddleware()

  try {
    for (const [method, path] of [
      ['GET', '/codex-api/telegram/config'],
      ['GET', '/codex-api/telegram/status'],
      ['POST', '/codex-api/telegram/configure-bot'],
    ]) {
      const request = new IncomingMessage(new Socket())
      request.method = method
      request.url = path
      request.push(JSON.stringify({ botToken: 'replacement-token', allowedUserIds: [456] }))
      request.push(null)
      const response = new ServerResponse(request)
      const next = vi.fn()

      await bridge(request, response, next)

      expect(next).toHaveBeenCalledOnce()
      expect(response.headersSent).toBe(false)
    }
    expect(await readFile(configPath, 'utf8')).toBe(legacyConfig)
    expect(fetchMock).not.toHaveBeenCalled()
  } finally {
    bridge.dispose()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await rm(codexHome, { recursive: true, force: true })
  }
})
