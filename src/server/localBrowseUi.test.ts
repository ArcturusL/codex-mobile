import { test, expect } from 'vitest'
import express from 'express'
import { mkdtemp, writeFile, mkdir, readFile, rm, symlink, access, truncate } from 'node:fs/promises'
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

test('copy file text returns exact current UTF-8 content and rejects unreadable, binary, and oversized files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copy-file-text-'))
  const app = express()
  app.use(localFileActionsMiddleware)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const { port } = server.address() as { port: number }
  const read = (path: string) => fetch(`http://127.0.0.1:${port}/codex-local-file?format=text&path=${encodeURIComponent(path)}`)
  try {
    const file = join(dir, '中文 (draft) #?%20.md')
    const content = '\uFEFF# 中文内容\r\n\r\n  **raw Markdown**\t😀\r\n'
    await writeFile(file, content)
    const response = await read(file)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ content })
    await writeFile(file, '')
    expect(await (await read(file)).json()).toEqual({ content: '' })
    await writeFile(file, 'changed on disk\n')
    expect(await (await read(file)).json()).toEqual({ content: 'changed on disk\n' })
    for (const binary of [Buffer.from([65, 0, 66]), Buffer.from([0xff, 0xfe, 0x61])]) {
      await writeFile(file, binary)
      expect((await read(file)).status).toBe(415)
    }
    await truncate(file, 10 * 1024 * 1024 + 1)
    expect((await read(file)).status).toBe(413)
    expect((await read(dir)).status).toBe(400)
    expect((await read('relative.txt')).status).toBe(400)
    expect((await read(file + '\0')).status).toBe(400)
    expect((await read(join(dir, 'missing.md'))).status).toBe(404)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
