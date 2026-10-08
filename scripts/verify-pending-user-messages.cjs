const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium, expect } = require('@playwright/test')
const base = process.env.BASE_URL || 'http://127.0.0.1:4204'
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const output = path.resolve('output/playwright/pending-user-messages')
const threadId = '0195f727-b3ce-7843-bcb7-04b36dc70543'
const cwd = '/tmp/TestChatRecovery'
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const user = (id, text) => ({ id, type: 'userMessage', content: [{ type: 'text', text }], createdAtIso: new Date().toISOString() })

async function check(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.addInitScript(({ threadId, theme }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
    localStorage.setItem('codex-web-local.ui-language.v1', 'en')
    localStorage.setItem('codex-web-local.in-progress-send-mode.v1', 'steer')
  }, { threadId, theme })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let socket, gate, release, requests = 0, failNewThread = false, failQueue = false
  let behavior = 'fail', active = false
  const turns = [{ id: 'old-turn', status: 'completed', items: [
    { ...user('old-user', 'repeat'), createdAtIso: '2026-01-01T00:00:00.000Z' },
    { id: 'old-answer', type: 'agentMessage', text: 'Older reply', createdAtIso: '2026-01-01T00:00:01.000Z' },
  ] }]
  const thread = () => ({ id: threadId, name: 'TestChat recovery', preview: 'repeat', cwd, createdAt: 1767225600, updatedAt: 1767225601,
    modelProvider: 'openai', model: 'gpt-6.1-sol', path: null, cliVersion: 'fixture', source: 'appServer', gitInfo: null,
    status: active ? 'inProgress' : 'completed', inProgress: active, turns })
  await page.routeWebSocket('**/*', ws => { if (new URL(ws.url()).pathname === '/codex-api/ws') socket = ws })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(base).origin) return route.abort()
    if (!url.pathname.startsWith('/codex-api/')) return route.continue()
    if (url.pathname === '/codex-api/thread-queue-state' && route.request().method() === 'PUT' && failQueue) return route.abort('internetdisconnected')
    if (url.pathname === '/codex-api/rpc') {
      const { method, params } = route.request().postDataJSON()
      if (method === 'turn/start') {
        requests++
        if (gate) await gate
        if (behavior !== 'fail') {
          active = true
          turns.push({ id: `turn-${requests}`, status: 'inProgress', items: [user(`accepted-${requests}`, params.input[0].text)] })
        }
        if (behavior !== 'success') return route.abort('internetdisconnected')
        return route.fulfill(json({ result: { turn: turns.at(-1) } }))
      }
      if (method === 'thread/start' && failNewThread) return route.abort('internetdisconnected')
      const result = method === 'thread/list' ? { data: [{ ...thread(), turns: [] }], nextCursor: null }
        : ['thread/read', 'thread/resume'].includes(method) ? { thread: thread() }
        : method === 'model/list' ? { data: [{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', displayName: 'GPT-6.1-sol', supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] }
        : method === 'config/read' ? { config: { model: 'gpt-6.1-sol', model_reasoning_effort: 'medium' } }
        : method === 'account/read' ? { account: { type: 'apiKey' }, requiresOpenaiAuth: false }
        : method === 'skills/list' ? { data: [] } : {}
      return route.fulfill(json({ result }))
    }
    const responses = {
      '/codex-api/server-requests/pending': { data: [] },
      '/codex-api/home-directory': { data: { path: '/tmp' } },
      '/codex-api/workspace-roots-state': { data: { order: [cwd], active: [cwd], labels: { [cwd]: 'TestChatRecovery' } } },
      '/codex-api/thread-titles': { data: { titles: {}, order: [] } },
      '/codex-api/thread-queue-state': { data: {} },
      '/codex-api/projectless-thread-cwd': { data: { cwd } },
    }
    return route.fulfill(json(responses[url.pathname] || { data: {} }))
  })
  try {
    await page.goto(`${base}/#/thread/${threadId}`)
    await page.getByText('Older reply', { exact: true }).waitFor()
    const input = page.locator('.thread-composer-input')
    const submit = page.locator('.thread-composer-submit')
    const pending = page.locator('li[data-message-type="userMessage.optimistic"]')
    gate = new Promise(resolve => { release = resolve })
    await input.fill('repeat')
    await submit.click()
    await expect(pending).toContainText('repeat')
    await expect(pending.locator('.message-delivery')).toHaveAttribute('data-state', 'sending')
    await expect(submit).toBeDisabled()
    await expect(input).toHaveValue('repeat')
    await expect.poll(() => requests).toBe(1)
    release(); gate = null
    await expect(pending.locator('.message-delivery')).toHaveAttribute('data-state', 'failed')
    await expect(submit).toBeEnabled()
    await pending.getByRole('button', { name: 'Copy message', exact: true }).click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'repeat')
    await page.reload()
    await expect(pending).toContainText('repeat')
    await expect(input).toHaveValue('repeat')
    await expect(page.getByText('Older reply', { exact: true })).toBeVisible()
    assert.equal(await page.locator('.conversation-item-message').last().getAttribute('data-message-type'), 'userMessage.optimistic')
    await pending.getByRole('button', { name: 'Restore to composer', exact: true }).click()
    await expect(input).toHaveValue('repeat')
    await page.waitForTimeout(2200)
    const screenshot = path.join(output, `${theme}-failed.png`)
    await page.screenshot({ path: screenshot })
    behavior = 'success'
    await submit.click()
    await expect(pending).toHaveCount(0)
    await expect(input).toHaveValue('')
    await expect(page.locator('.conversation-item-message[data-role="user"]')).toHaveCount(2)
    assert.equal(requests, 2)
    // No assistant reply was needed for the new user message to appear.
    assert.equal(turns.at(-1).items.length, 1)
    behavior = 'lost-ack'
    await input.fill('lost acknowledgement')
    await submit.click()
    await expect(pending.locator('.message-delivery')).toHaveAttribute('data-state', 'failed')
    active = false
    turns.at(-1).status = 'completed'
    socket.send(JSON.stringify({ method: 'turn/completed', params: { threadId, turn: turns.at(-1) }, atIso: new Date().toISOString() }))
    await expect(pending).toHaveCount(0)
    assert.equal(requests, 3, 'lost acknowledgements never trigger automatic resends')
    await expect(page.locator('.conversation-item-message[data-role="user"]').filter({ hasText: 'lost acknowledgement' })).toHaveCount(1)

    behavior = 'success'
    gate = new Promise(resolve => { release = resolve })
    await input.fill('accepted while editing')
    await submit.click()
    await expect.poll(() => requests).toBe(4)
    await input.fill('new draft already typing')
    release(); gate = null
    await expect(pending).toHaveCount(0)
    await expect(input).toHaveValue('new draft already typing')
    await expect(submit).toBeEnabled()
    failQueue = true
    await page.locator('.sidebar-settings-button').click()
    await page.locator('.sidebar-settings-row').filter({ hasText: 'When busy, send as' }).click()
    await page.locator('.sidebar-settings-button').click()
    await input.fill('queue failure keeps this draft')
    await expect(submit).toHaveAttribute('aria-label', 'Queue message')
    await submit.click()
    await expect(submit).toBeEnabled()
    await expect(input).toHaveValue('queue failure keeps this draft')
    assert.equal(requests, 4)

    failNewThread = true
    await page.goto(`${base}/#/`)
    await input.waitFor()
    const folder = page.locator('.new-thread-folder-dropdown')
    await folder.locator('.composer-dropdown-trigger').click()
    await folder.locator('.composer-dropdown-option').filter({ hasText: 'TestChatRecovery' }).first().click()
    await input.fill('new thread failure must retain this draft')
    await submit.click()
    await expect(submit).toBeEnabled()
    await expect(input).toHaveValue('new thread failure must retain this draft')
    await page.reload()
    await expect(input).toHaveValue('new thread failure must retain this draft')
    assert.deepEqual(errors, [])
    return { theme, url: base, viewport: '1440x1000', passed: true, requests, screenshot, errors }
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${theme}-failure.png`) })
    fs.writeFileSync(path.join(output, `${theme}-failure.txt`), await page.locator('body').innerText())
    throw error
  } finally { await context.close() }
}
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const results = []
    for (const theme of ['light', 'dark']) results.push(await check(browser, theme))
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, results }, null, 2))
    console.log(JSON.stringify(results))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
