const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')
const express = require('express')
const baseUrl = process.env.CODEXUI_BASE_URL || 'http://127.0.0.1:4181'
const outputDir = resolve('output/playwright')
const threadId = '0195f727-b3ce-b843-bcb7-04b36dc70542'
const cwd = '/tmp/DesktopCheck'
const diff = 'diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-before\n+after\n'
const file = { id: 'example', path: 'example.txt', absolutePath: `${cwd}/example.txt`, operation: 'update', addedLineCount: 1, removedLineCount: 1, diff, hunks: [{ id: 'hunk', header: '@@ -1 +1 @@', patch: diff, addedLineCount: 1, removedLineCount: 1, lines: [{ key: 'old', kind: 'remove', text: 'before', oldLine: 1, newLine: null }, { key: 'new', kind: 'add', text: 'after', oldLine: null, newLine: 1 }] }] }
const summary = { fileCount: 1, addedLineCount: 1, removedLineCount: 1 }
const thread = { id: threadId, name: 'Desktop verification', preview: 'Desktop layout check', cwd, updatedAt: 1774680300, createdAt: 1774680000, modelProvider: 'openai', model: 'gpt-5.4', path: null, source: 'appServer', gitInfo: { branch: 'main' }, status: 'completed', turns: [{ id: 'desktop-turn', status: 'completed', items: [{ id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'Review this change.' }] }, { id: 'file', type: 'fileChange', status: 'completed', changes: [{ path: `${cwd}/example.txt`, kind: { type: 'update' }, diff }] }, { id: 'answer', type: 'agentMessage', text: 'Desktop conversation is ready.' }] }] }
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function verify(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
  await context.addInitScript(({ theme }) => {
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
    localStorage.setItem('codex-web-local.sidebar-collapsed.v1', 'false')
  }, { theme })
  const page = await context.newPage()
  const errors = []
  const apiCounts = {}
  const rpcCounts = {}
  page.on('pageerror', (error) => errors.push(error.message))
  await page.routeWebSocket('**/codex-api/ws', () => {})
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(baseUrl).origin) return route.abort()
    if (!url.pathname.startsWith('/codex-api/')) return route.continue()
    apiCounts[url.pathname] = (apiCounts[url.pathname] || 0) + 1
    if (url.pathname === '/codex-api/rpc') {
      const { method } = route.request().postDataJSON()
      rpcCounts[method] = (rpcCounts[method] || 0) + 1
      const results = {
        'thread/list': { data: [{ ...thread, turns: [] }], nextCursor: null },
        'thread/read': { thread }, 'thread/resume': { thread },
        'turn/start': { turn: { id: 'desktop-send', status: 'inProgress', items: [] } },
        'model/list': { data: [{ id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4', supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] },
        'config/read': { config: { model: 'gpt-5.4', model_reasoning_effort: 'medium' } },
        'account/read': { account: { type: 'apiKey' }, requiresOpenaiAuth: false },
        'account/rateLimits/read': { rateLimits: null, rateLimitsByLimitId: {} },
        'skills/list': { data: [] },
      }
      return route.fulfill(json({ result: results[method] || {} }))
    }
    const bodies = {
      '/codex-api/server-requests/pending': { data: [] },
      '/codex-api/home-directory': { data: { path: '/tmp' } },
      '/codex-api/workspace-roots-state': { data: { order: [cwd], labels: { [cwd]: 'DesktopCheck' }, active: [cwd] } },
      '/codex-api/thread-titles': { data: { titles: {}, order: [] } },
      '/codex-api/thread-terminal/status': { available: true },
      '/codex-api/thread-terminal/attach': { session: { id: 'terminal', threadId, cwd, shell: '/bin/bash', buffer: 'Desktop terminal ready\r\n$ ', truncated: false } },
      '/codex-api/review/summary': { data: summary },
      '/codex-api/review/snapshot': { data: { cwd, gitRoot: cwd, isGitRepo: true, scope: 'workspace', workspaceView: 'unstaged', headBranch: 'main', baseBranch: 'main', baseBranchOptions: ['main'], summary, files: [file] } },
      '/codex-api/git/branches': { data: { branches: [{ name: 'main', current: true }], currentBranch: 'main' } },
      '/codex-api/git/repository-status': { data: { isGitRepo: true, branch: 'main', dirty: true } },
    }
    return route.fulfill(json(bodies[url.pathname] || { data: {} }))
  })
  const url = `${baseUrl}/#/thread/${threadId}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('.thread-composer-input').waitFor()
    await page.getByText('Desktop conversation is ready.', { exact: true }).waitFor()
    assert(await page.locator('.desktop-sidebar').isVisible())
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark')
    assert.equal(await page.locator('link[rel="manifest"],meta[name="apple-mobile-web-app-capable"]').count(), 0)
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0)
    await page.locator('.sidebar-settings-button').click()
    await page.locator('.sidebar-settings-panel').waitFor()
    const dropdownBackgrounds = await page.locator('.sidebar-settings-panel .composer-dropdown-trigger').evaluateAll((nodes) => nodes.map((node) => {
      const canvas = document.createElement('canvas').getContext('2d')
      canvas.fillStyle = getComputedStyle(node).backgroundColor
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }))
    assert(dropdownBackgrounds.length > 0)
    assert(dropdownBackgrounds.every((rgb) => theme === 'dark' ? rgb.every((value) => value < 70) : rgb.every((value) => value > 240)), `Settings dropdown theme: ${dropdownBackgrounds}`)
    assert.equal(await page.locator('.sidebar-settings-panel [class*="telegram"]').count(), 0)
    assert.equal(await page.getByRole('button', { name: /connect telegram|save telegram/i }).count(), 0)
    await page.waitForTimeout(2100)
    await page.screenshot({ path: resolve(outputDir, `desktop-only-settings-${theme}.png`) })
    await page.locator('.sidebar-settings-button').click()
    await page.locator('.thread-composer-attach').click()
    assert.equal(await page.getByRole('button', { name: 'Take photo', exact: true }).count(), 0)
    await page.locator('.thread-composer-attach').click()
    await page.locator('.content-header-terminal-command .composer-dropdown-trigger').click()
    await page.getByRole('button', { name: 'Open terminal', exact: true }).last().click()
    await page.locator('.thread-terminal-panel .xterm-helper-textarea').focus()
    await page.waitForTimeout(300)
    const terminal = await page.locator('.thread-terminal-panel').boundingBox()
    assert(terminal.height < 700, 'Terminal focus preserves bottom panel')
    await page.locator('.thread-terminal-panel button[title="Hide terminal"]').click()
    await page.locator('.header-git-trigger').click()
    await page.locator('.header-git-review-row').click()
    await page.locator('.review-pane-file-list').waitFor()
    await page.locator('.review-pane-file-list').getByText('example.txt', { exact: true }).click()
    assert((await page.locator('.review-pane').innerText()).includes('after'))
    await page.waitForTimeout(2100)
    await page.screenshot({ path: resolve(outputDir, `desktop-only-review-${theme}.png`) })
    await page.locator('.review-pane-close').click()
    if (await page.locator('.header-git-menu').isVisible()) await page.locator('.header-git-trigger').click()
    await page.locator('.file-change-summary-row').first().click()
    await page.locator('.file-change-path-button').first().click()
    await page.locator('.diff-viewer-sidebar').waitFor()
    await page.waitForTimeout(2100)
    await page.screenshot({ path: resolve(outputDir, `desktop-only-diff-${theme}.png`) })
    await page.locator('.diff-viewer-close').click()
    await page.locator('.diff-viewer-backdrop').waitFor({ state: 'detached' })
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport)
      assert(await page.locator('.desktop-sidebar').isVisible(), 'Narrow viewport retains desktop sidebar')
      assert.equal(await page.locator('.mobile-drawer-backdrop,.mobile-drawer,.is-mobile').count(), 0)
      await page.waitForTimeout(2100)
      await page.screenshot({ path: resolve(outputDir, `desktop-only-${viewport.width}-${theme}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
    assert.equal(await page.locator('.desktop-sidebar').count(), 0)
    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
    assert(await page.locator('.desktop-sidebar').isVisible())
    await page.locator('.thread-composer-input').fill('Desktop focus check')
    await page.locator('.thread-composer-submit').click()
    await page.waitForFunction(() => {
      const input = document.querySelector('.thread-composer-input')
      return input && !input.value && document.activeElement === input
    })
    assert.equal(rpcCounts['turn/start'], 1)
    assert.equal(Object.keys(apiCounts).filter((path) => path.includes('telegram')).length, 0)
    assert.deepEqual(errors, [])
    const evidence = { url, theme, apiCounts, rpcCounts, terminal, errors, screenshots: resolve(outputDir, `desktop-only-*-${theme}.png`) }
    writeFileSync(resolve(outputDir, `desktop-only-${theme}.json`), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence))
    if (theme === 'light') {
      await page.evaluate(async () => {
        await caches.open('codexweb-shell-v2')
        await caches.open('unrelated-cache')
        await navigator.serviceWorker.register('/sw.js')
      })
      await page.waitForFunction(async () => !(await caches.keys()).includes('codexweb-shell-v2') && !(await navigator.serviceWorker.getRegistrations()).length)
      assert(await page.evaluate(async () => (await caches.keys()).includes('unrelated-cache')))
      console.log('PASS: browser service worker retires its cache and registration')
    }
  } catch (error) {
    await page.screenshot({ path: resolve(outputDir, `desktop-only-failure-${theme}.png`) })
    console.error({ errors, apiCounts, text: (await page.locator('body').innerText()).slice(-3000) })
    throw error
  } finally { await context.close() }
}

async function verifyDocs(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
  try {
    const page = await context.newPage()
    await page.goto(pathToFileURL(resolve('docs/index.html')).href)
    assert.equal(await page.locator('h1').innerText(), 'Codex in your desktop browser.')
    assert.equal(await page.locator('a[href*="play.google"],a[href$=".apk"],iframe').count(), 0)
    await page.locator('img').last().scrollIntoViewIfNeeded()
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0))
    await page.locator('h1').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2100)
    await page.screenshot({ path: resolve(outputDir, `desktop-only-website-${theme}.png`) })
    console.log(`PASS: desktop website (${theme}), two local screenshots and no APK links`)
  } finally { await context.close() }
}

async function main() {
  mkdirSync(outputDir, { recursive: true })
  let server
  if (!process.env.CODEXUI_BASE_URL) {
    const app = express()
    app.use(express.static(resolve('dist')))
    server = await new Promise((done, reject) => {
      const instance = app.listen(4181, '127.0.0.1', () => done(instance))
      instance.on('error', reject)
    })
  }
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    for (const theme of ['light', 'dark']) { await verify(browser, theme); await verifyDocs(browser, theme) }
  } finally {
    await browser?.close()
    if (server) await new Promise((done) => server.close(done))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
