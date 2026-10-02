import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import express from 'express'
import { afterEach, expect, it, vi } from 'vitest'
import { createAuthSession } from './authMiddleware.js'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

it('accepts both passwords, keeps custom password across restarts and shares session authorization', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dual-auth-'))
  homes.push(home)
  vi.stubEnv('CODEX_HOME', home)
  vi.stubEnv('CODEX_WEB_CUSTOM_PASSWORD_FILE', '')
  const path = join(home, 'codexui-custom-password')
  writeFileSync(path, 'user-chosen-secret\n', { mode: 0o600 })
  for (const primary of ['generated-first', 'generated-after-restart']) {
    const auth = createAuthSession(primary)
    const app = express()
    // Simulate the public Host header supplied by the reverse proxy.
    app.use((req, _res, next) => { req.headers.host = 'remote.example'; next() })
    app.use(auth.middleware)
    app.get('/protected', (_req, res) => res.json({ protected: true }))
    const server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const base = `http://127.0.0.1:${address.port}`
    try {
      for (const password of [primary, 'user-chosen-secret', 'wrong', '', null]) {
        const response = await fetch(`${base}/auth/login`, {
          method: 'POST', headers: { host: 'remote.example', 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        const valid = password === primary || password === 'user-chosen-secret'
        expect(response.status).toBe(valid ? 200 : 401)
        if (valid) {
          const cookie = response.headers.get('set-cookie')!.split(';')[0]
          const protectedResponse = await fetch(`${base}/protected`, { headers: { host: 'remote.example', cookie } })
          expect(await protectedResponse.json()).toEqual({ protected: true })
          expect(auth.isRequestAuthorized({ socket: { remoteAddress: '203.0.113.1' }, headers: { host: 'remote.example', cookie } } as never)).toBe(true)
        }
      }
      const link = await fetch(`${base}/password=user-chosen-secret`, { headers: { host: 'remote.example' }, redirect: 'manual' })
      expect(link.status).toBe(302)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
})

it('allows an absent optional file but fails on invalid or missing explicit configuration', () => {
  const home = mkdtempSync(join(tmpdir(), 'dual-auth-'))
  homes.push(home)
  vi.stubEnv('CODEX_HOME', home)
  vi.stubEnv('CODEX_WEB_CUSTOM_PASSWORD_FILE', '')
  expect(() => createAuthSession('generated')).not.toThrow()
  const path = join(home, 'fixed-secret')
  vi.stubEnv('CODEX_WEB_CUSTOM_PASSWORD_FILE', path)
  expect(() => createAuthSession('generated')).toThrow('Unable to load')
  writeFileSync(path, '\n')
  expect(() => createAuthSession('generated')).toThrow('Unable to load')
  writeFileSync(path, 'first\nsecond')
  expect(() => createAuthSession('generated')).toThrow('Unable to load')
  writeFileSync(path, 'valid-secret\r\n')
  expect(() => createAuthSession('generated')).not.toThrow()
})
