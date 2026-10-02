const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, truncateSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { resolve, join } = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.CODEXUI_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = resolve('output/playwright')
const threadId = '0195f727-b3ce-b843-bcb7-04b36dc70542'
const cwd = mkdtempSync(join(tmpdir(), 'TestChat-copy-file-text-'))
const filePath = join(cwd, '中文 (draft) #?%20.md')
const expected = '# 中文原文\n\n  **Markdown**\t😀\nlast line\n'
const marker = `TESTCHAT_COPY_FILE_TEXT_${Date.now()}`
const content = `${marker}\n\n[正文](<${filePath}:12>)\n\n[empty](${cwd}/empty.txt) · [binary](${cwd}/binary.dat) · [missing](${cwd}/missing.txt) · [large](${cwd}/large.txt) · [directory](${cwd})\n\n[external](https://example.com/codex-local-browse/tmp/external.txt)`
const viewport = { width: 1280, height: 900 }

function json(body) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

function thread(state, turns = state.turns) {
  return { id: threadId, name: 'TestChat copy file text', preview: marker, cwd, updatedAt: 1774680300, createdAt: 1774680000, modelProvider: 'openai', model: 'gpt-5.4', path: null, cliVersion: 'mock', source: 'appServer', gitInfo: { branch: 'main' }, status: state.active ? 'inProgress' : 'completed', inProgress: state.active, turns }
}

async function setup(context, page, theme) {
  const state = { turns: [], active: false, sent: [], rpcCounts: {}, apiCounts: {}, externalRequests: [], pageErrors: [] }
  await context.addInitScript(({ threadId, theme }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
  }, { threadId, theme })
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText))
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).pathname !== '/codex-local-file') {
      console.error('HTTP error:', response.status(), response.url())
    }
  })
  await page.routeWebSocket('**/codex-api/ws', (socket) => { state.socket = socket })
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== new URL(baseUrl).origin) {
      state.externalRequests.push(request.url())
      return route.abort()
    }
    if (!url.pathname.startsWith('/codex-api/')) return route.continue()
    state.apiCounts[url.pathname] = (state.apiCounts[url.pathname] || 0) + 1
    if (url.pathname === '/codex-api/rpc') {
      const payload = request.postDataJSON()
      state.rpcCounts[payload.method] = (state.rpcCounts[payload.method] || 0) + 1
      let result = {}
      switch (payload.method) {
        case 'thread/list': result = { data: [thread(state, [])], nextCursor: null }; break
        case 'thread/read':
        case 'thread/resume': result = { thread: thread(state) }; break
        case 'turn/start': {
          state.sent.push(payload.params)
          state.active = true
          state.turns = [{ id: 'copy-turn', status: 'inProgress', items: [{ id: 'copy-user', type: 'userMessage', content: payload.params.input }] }]
          result = { turn: state.turns[0] }
          break
        }
        case 'model/list': result = { data: [{ id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4', supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] }; break
        case 'config/read': result = { config: { model: 'gpt-5.4', model_reasoning_effort: 'medium', service_tier: 'default' } }; break
        case 'account/read': result = { account: { type: 'apiKey' }, requiresOpenaiAuth: false }; break
        case 'account/rateLimits/read': result = { rateLimits: null, rateLimitsByLimitId: {} }; break
        case 'skills/list': result = { data: [] }; break
      }
      return route.fulfill(json({ result }))
    }
    let body = { data: {} }
    switch (url.pathname) {
      case '/codex-api/server-requests/pending': body = { data: [] }; break
      case '/codex-api/home-directory': body = { data: { path: '/tmp' } }; break
      case '/codex-api/workspace-roots-state': body = { data: { order: [cwd], labels: { [cwd]: 'TestChat' }, active: [cwd] } }; break
      case '/codex-api/thread-titles': body = { data: { titles: {}, order: [] } }; break
      case '/codex-api/transport-diagnostics':
      case '/codex-api/system-row-diagnostics': body = { ok: true }; break
    }
    return route.fulfill(json(body))
  })
  state.emit = (method, params) => {
    assert(state.socket, 'Mock WebSocket connected')
    state.socket.send(JSON.stringify({ method, params: { threadId, turnId: 'copy-turn', ...params }, atIso: new Date().toISOString() }))
  }
  return state
}


async function run(browser, theme) {
  writeFileSync(filePath, expected)
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  const state = await setup(context, page, theme)
  const fileRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/codex-local-file') fileRequests.push(request.url())
  })
  const menu = page.locator('.file-link-context-menu')
  const copyButton = menu.getByRole('button', { name: 'Copy file text', exact: true })
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  const url = `${baseUrl}/#/thread/${threadId}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('.thread-composer-input').fill(content)
    await page.locator('.thread-composer-submit').click()
    await page.waitForFunction(() => !document.querySelector('.thread-composer-input')?.value)
    assert.equal(state.sent.length, 1)
    assert(state.sent[0].input.some(input => input.text?.includes(marker)))
    state.emit('turn/started', { turn: state.turns[0] })
    state.emit('item/started', { item: { id: 'copy-answer', type: 'agentMessage', text: '' } })
    state.emit('item/agentMessage/delta', { itemId: 'copy-answer', delta: content })
    await page.locator('.message-row[data-role="assistant"]').filter({ hasText: marker }).last().waitFor()
    const answer = { id: 'copy-answer', type: 'agentMessage', text: content }
    state.turns[0].items.push(answer)
    state.turns[0].status = 'completed'
    state.active = false
    state.emit('item/completed', { item: answer })
    state.emit('turn/completed', { turn: state.turns[0] })
    const row = page.locator('.message-row[data-role="assistant"]').filter({ hasText: marker }).last()
    const link = (label) => row.getByRole('link', { name: label, exact: true })
    await link('正文').waitFor()
    const evidence = await link('正文').evaluate((node, path) => ({
      hrefOk: node.getAttribute('href') === '/codex-local-browse' + path.split('/').map(encodeURIComponent).join('/'),
      titleOk: node.getAttribute('title') === path,
      textOk: node.textContent.trim() === '正文',
    }), filePath)
    for (const key of ['hrefOk', 'titleOk', 'textOk']) assert(evidence[key], key)
    assert.equal(fileRequests.length, 0, 'Rendering must not fetch file contents')
    await link('正文').click({ button: 'right' })
    await copyButton.waitFor()
    assert.equal(fileRequests.length, 0, 'Opening the menu must not fetch file contents')
    const started = performance.now()
    await copyButton.click()
    await menu.getByRole('status').filter({ hasText: 'File text copied.' }).waitFor()
    const copyMs = performance.now() - started
    assert.equal(await clipboard(), expected)
    assert.equal(fileRequests.length, 1, 'Exactly one request per copy')
    const colors = await menu.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, text: getComputedStyle(node.querySelector('button')).color }))
    assert.equal(colors.background, theme === 'dark' ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)')
    await page.waitForTimeout(2200)
    const screenshot = resolve(outputDir, `testchat-copy-file-text-${theme}-cjs.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    if (theme === 'light') await page.screenshot({ path: resolve(outputDir, 'testchat-copy-file-text-cjs.png'), fullPage: true })
    const copy = async (label, status) => {
      await page.keyboard.press('Escape')
      await link(label).click({ button: 'right' })
      const before = fileRequests.length
      await copyButton.click()
      await menu.getByRole('status').filter({ hasText: status }).waitFor()
      assert.equal(fileRequests.length, before + 1)
    }
    writeFileSync(filePath, '最新内容\n')
    await copy('正文', 'File text copied.')
    assert.equal(await clipboard(), '最新内容\n', 'Reads current disk content')
    await copy('empty', 'File text copied.')
    assert.equal(await clipboard(), '', 'Empty content is a successful copy')
    await page.evaluate(() => navigator.clipboard.writeText('keep clipboard'))
    for (const [label, error] of [['binary', 'Only UTF-8 text'], ['missing', 'Could not read'], ['directory', 'Only text files'], ['large', 'too large']]) {
      await copy(label, error)
      assert.equal(await clipboard(), 'keep clipboard', `${label} preserves clipboard`)
    }
    await page.keyboard.press('Escape')
    await link('external').click({ button: 'right' })
    assert.equal(await copyButton.count(), 0, 'External links cannot read local file contents')
    await page.keyboard.press('Escape')
    await link('正文').click({ button: 'right' })
    const browseHref = await link('正文').getAttribute('href')
    await menu.getByRole('button', { name: 'Copy link', exact: true }).click()
    assert.equal(await clipboard(), browseHref, 'Copy link still copies the URL')
    await link('正文').click({ button: 'right' })
    await page.keyboard.press('Escape')
    assert.equal(await menu.count(), 0)
    await link('正文').click({ button: 'right' })
    await row.click({ position: { x: 5, y: 5 } })
    assert.equal(await menu.count(), 0, 'Outside click closes menu')

    // Exercise the existing selection fallback and denied clipboard behavior.
    await page.evaluate(() => {
      navigator.clipboard.write = async () => { throw new Error('denied') }
      navigator.clipboard.writeText = async () => { throw new Error('denied') }
    })
    await copy('正文', 'File text copied.')
    assert.equal(await clipboard(), '最新内容\n')
    await page.evaluate(() => { document.execCommand = () => false })
    await copy('正文', 'Copy failed')
    assert.equal(await clipboard(), '最新内容\n')
    assert.deepEqual(state.pageErrors, [])
    return { url, viewport, theme, ...evidence, clipboardOk: true, failurePreservesClipboard: true, fallbackOk: true, copyMs, fileRequests: fileRequests.length, renderFileRequests: 0, menuFileRequests: 0, colors, screenshot, apiCounts: state.apiCounts, pageErrors: state.pageErrors }
  } catch (error) {
    console.error(JSON.stringify({ pageErrors: state.pageErrors, rpcCounts: state.rpcCounts }))
    await page.screenshot({ path: resolve(outputDir, `testchat-copy-file-text-failure-${theme}.png`), fullPage: true })
    throw error
  } finally {
    await context.close()
  }
}

;(async () => {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(cwd, 'empty.txt'), '')
  writeFileSync(join(cwd, 'binary.dat'), Buffer.from([65, 0, 66, 255]))
  writeFileSync(join(cwd, 'large.txt'), '')
  truncateSync(join(cwd, 'large.txt'), 10 * 1024 * 1024 + 1)
  const browser = await chromium.launch({ headless: true })
  try {
    const reports = []
    for (const theme of ['light', 'dark']) reports.push(await run(browser, theme))
    writeFileSync(resolve(outputDir, 'testchat-copy-file-text-cjs.json'), JSON.stringify(reports, null, 2))
    console.log(JSON.stringify(reports, null, 2))
  } finally {
    await browser.close()
    rmSync(cwd, { recursive: true, force: true })
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
