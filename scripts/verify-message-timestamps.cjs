const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

// Intercept every API/WebSocket before opening the isolated candidate.
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
assert(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname))
const output = resolve('output/playwright/message-timestamps')
const threadId = '0195f727-b3ce-7843-bcb7-04b36dc70543'
const cwd = '/tmp/TestChatTimestamps'
const firstTime = '2026-09-22T01:02:03.000Z'
const marker = `TIMESTAMPS_${Date.now()}`
const user = (id, text, createdAtIso) => ({ id, type: 'userMessage', content: [{ type: 'text', text }], createdAtIso })
const reply = (id, text, createdAtIso) => ({ id, type: 'agentMessage', text, createdAtIso })
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function check(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', locale: 'en-GB', permissions: ['clipboard-read', 'clipboard-write'] })
  await context.addInitScript(({ threadId, theme }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
  }, { threadId, theme })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let socket
  let active = false
  let apiCount = 0
  const turns = [{ id: 'history', status: 'completed', items: [
    user('old-user', `${marker} historical request`, firstTime),
    reply('old-answer', 'Historical reply', '2026-09-22T01:03:04.000Z'),
    reply('unknown', 'Legacy message without recorded time'),
    { id: 'image', type: 'imageView', path: '/tmp/timestamp-test.png', createdAtIso: firstTime },
  ] }]
  const thread = () => ({ id: threadId, name: 'TestChat timestamps', preview: marker, cwd, createdAt: 1790038923, updatedAt: 1790038984, modelProvider: 'openai', model: 'gpt-5.4', path: null, cliVersion: 'fixture', source: 'appServer', gitInfo: null, status: active ? 'inProgress' : 'completed', inProgress: active, turns })
  await page.routeWebSocket('**/*', (ws) => { if (new URL(ws.url()).pathname === '/codex-api/ws') socket = ws })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(baseUrl).origin) return route.abort()
    if (url.pathname === '/codex-local-image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><rect width="80" height="30" fill="#64748b"/></svg>' })
    if (!url.pathname.startsWith('/codex-api/')) return route.continue()
    apiCount++
    if (url.pathname === '/codex-api/rpc') {
      const { method, params } = route.request().postDataJSON()
      let result = {}
      if (method === 'thread/list') result = { data: [{ ...thread(), turns: [] }], nextCursor: null }
      if (['thread/read', 'thread/resume'].includes(method)) result = { thread: thread(), threadTurnStartIndex: 1 }
      if (method === 'turn/start') {
        active = true
        turns.push({ id: 'live', status: 'inProgress', items: [user('live-user', params.input[0].text, firstTime)] })
        result = { turn: turns.at(-1) }
      }
      if (method === 'model/list') result = { data: [{ id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4', supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] }
      if (method === 'config/read') result = { config: { model: 'gpt-5.4', model_reasoning_effort: 'medium' } }
      if (method === 'account/read') result = { account: { type: 'apiKey' }, requiresOpenaiAuth: false }
      if (method === 'skills/list') result = { data: [] }
      return route.fulfill(json({ result }))
    }
    const responses = {
      '/codex-api/thread-turn-page': { result: { thread: { ...thread(), turns: [{ id: 'earlier', status: 'completed', items: [user('earlier-user', 'Earlier page request', '2026-09-20T23:00:00.000Z')] }] } }, startTurnIndex: 0, hasMoreOlder: false },
      '/codex-api/server-requests/pending': { data: [] },
      '/codex-api/home-directory': { data: { path: '/tmp' } },
      '/codex-api/workspace-roots-state': { data: { order: [cwd], active: [cwd], labels: { [cwd]: 'TestChatTimestamps' } } },
      '/codex-api/thread-titles': { data: { titles: {}, order: [] } },
    }
    return route.fulfill(json(responses[url.pathname] || { data: {} }))
  })
  const row = (text) => page.locator('.conversation-item-message').filter({ hasText: text })
  const timestamp = (text) => row(text).locator('time.message-timestamp')
  await page.goto(`${baseUrl}/#/thread/${threadId}`)
  await timestamp('Historical reply').waitFor()
  assert.equal(await timestamp('historical request').getAttribute('datetime'), firstTime)
  assert.match(await timestamp('historical request').innerText(), /22\/09\/2026, 09:02:03/)
  assert.equal(await row('Legacy message').locator('.message-timestamp').innerText(), 'Time unknown')
  assert.equal(await page.locator('[data-message-type="imageView"] > time').getAttribute('datetime'), firstTime)
  assert.equal(await timestamp('historical request').evaluate((node) => getComputedStyle(node).textAlign), 'right')
  assert.equal(await timestamp('Historical reply').evaluate((node) => getComputedStyle(node).color), theme === 'dark' ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)')
  await page.locator('.load-more-button').click()
  await timestamp('Earlier page request').waitFor()
  assert.equal(await timestamp('Earlier page request').getAttribute('datetime'), '2026-09-20T23:00:00.000Z')
  await page.locator('.thread-composer-input').fill(`${marker} live request`)
  await page.locator('.thread-composer-submit').click()
  await page.waitForFunction(() => !document.querySelector('.thread-composer-input')?.value)
  const emit = (method, params, atIso = firstTime) => socket.send(JSON.stringify({ method, params: { threadId, turnId: 'live', ...params }, atIso }))
  emit('turn/started', { turn: turns.at(-1) })
  emit('item/agentMessage/delta', { itemId: 'live-answer', delta: 'Streaming' })
  await timestamp('Streaming').waitFor()
  const started = await timestamp('Streaming').getAttribute('datetime')
  emit('item/agentMessage/delta', { itemId: 'live-answer', delta: ' reply' }, '2026-09-22T01:02:05.000Z')
  await timestamp('Streaming reply').waitFor()
  assert.equal(await timestamp('Streaming reply').getAttribute('datetime'), started)
  const answer = reply('live-answer', 'Streaming reply', firstTime)
  turns.at(-1).items.push(answer)
  emit('item/completed', { item: answer }, '2026-09-22T01:02:09.000Z')
  turns.at(-1).status = 'completed'
  active = false
  emit('turn/completed', { turn: turns.at(-1) })
  await page.reload()
  await timestamp('Streaming reply').waitFor()
  assert.equal(await timestamp('Streaming reply').getAttribute('datetime'), firstTime)
  await row('Streaming reply').locator('.message-copy-button').click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Streaming reply')
  await page.waitForTimeout(2500)
  const before = apiCount
  await timestamp('Streaming reply').hover()
  assert.match(await timestamp('Streaming reply').getAttribute('title'), /GMT\+0800/)
  assert.equal(apiCount, before, 'Timestamp inspection makes no API requests')
  assert.deepEqual(errors, [])
  const screenshot = resolve(output, `${theme}.png`)
  await page.screenshot({ path: screenshot })
  const report = { theme, url: page.url(), viewport: page.viewportSize(), screenshot, recordedTimes: await page.locator('time.message-timestamp').evaluateAll((nodes) => nodes.map((node) => node.dateTime)), apiCount, timestampRequests: apiCount - before, errors }
  await context.close()
  return report
}

;(async () => {
  mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const reports = []
    for (const theme of ['light', 'dark']) reports.push(await check(browser, theme))
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(reports, null, 2))
    console.log(JSON.stringify(reports, null, 2))
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
