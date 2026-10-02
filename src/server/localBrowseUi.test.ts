import { test, expect } from 'vitest'
import express from 'express'
import { mkdtemp, writeFile, mkdir, readFile, rm, symlink, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localFileActionsMiddleware, createDirectoryListingHtml } from './localBrowseUi'

test('file actions validate destructive requests and unlink symlinks without deleting targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'browse-actions-'))
  const app = express()
  app.use(localFileActionsMiddleware)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const remove = (path: string, headers: Record<string, string> = { 'X-Codex-File-Action': 'remove' }) =>
    fetch(`http://127.0.0.1:${address.port}/codex-local-file?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers })
  try {
    const file = join(dir, '中文 #?%20.txt')
    await writeFile(file, 'keep me')
    const html = await createDirectoryListingHtml(dir)
    expect(html).toContain('Options for 中文 #?%20.txt')
    expect(html).toContain('%23%3F%2520.txt')
    expect(html).toContain('download="中文 #?%20.txt"')
    expect(html).not.toContain('✏️')
    expect((await remove(file, {})).status).toBe(403)
    expect((await remove(file, { 'X-Codex-File-Action': 'remove', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await remove('/tmp/..')).status).toBe(400)
    expect((await remove('relative.txt')).status).toBe(400)
    const link = join(dir, 'link')
    await symlink(file, link)
    expect((await remove(link)).status).toBe(200)
    expect(await readFile(file, 'utf8')).toBe('keep me')
    const folder = join(dir, 'nested')
    await mkdir(folder)
    await writeFile(join(folder, 'child.txt'), 'remove me')
    expect((await remove(folder)).status).toBe(200)
    await expect(access(folder)).rejects.toThrow()
    expect((await remove(file)).status).toBe(200)
    expect((await remove(file)).status).toBe(404)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
