const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
assert(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname))
const outputDir = resolve(process.env.OUTPUT_DIR || 'output/playwright/user-input')
const threadId = '0195f727-b3ce-7843-bcb7-04b36dc70543'
const cwd = '/tmp/TestChatUserInput'
const viewport = { width: 1440, height: 1080 }
const questions = [
  { id: 'approach', header: '实现方式', question: '希望采用哪种实现方式？', isOther: false, options: [
    { label: '小步修改（推荐）', description: '复用现有协议，减少改动范围。' },
    { label: '完整重写', description: '替换现有交互流程。' },
  ] },
  { id: 'validation', header: '验证范围', question: '希望如何验证？', options: [
    { label: '自动测试（推荐）', description: '覆盖超时和重复提交。' },
    { label: '手动验证', description: '逐步操作检查。' },
  ] },
]
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context, theme) {
  const page = await context.newPage()
  const state = { request: null, replies: [], snoozes: [], counts: {}, errors: [], failSnooze: false, replyStatus: 200 }
  const thread = { id: threadId, name: '询问与回答测试', preview: 'USER_INPUT_TEST', cwd, updatedAt: 1789869000, createdAt: 1789868000, modelProvider: 'openai', model: 'gpt-5.4', status: 'inProgress', inProgress: true, turns: [{ id: 'turn', status: 'inProgress', items: [{ type: 'userMessage', id: 'seed', content: [{ type: 'text', text: '请实现询问与回答，并让我选择实现方式和验证范围。' }] }] }] }
  await context.addInitScript(({ theme, threadId }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
    localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN')
  }, { theme, threadId })
  page.on('pageerror', (error) => state.errors.push(error.message))
  let socketReady
  const connected = new Promise(resolve => { socketReady = resolve })
  await page.routeWebSocket('**/*', socket => { if (new URL(socket.url()).pathname === '/codex-api/ws') { state.socket = socket; socketReady() } })
  state.emit = (method, params) => state.socket.send(JSON.stringify({ method, params, atIso: new Date().toISOString() }))
  state.ask = (id, extra = {}) => {
    state.request = { id, method: 'item/tool/requestUserInput', receivedAtIso: new Date().toISOString(), autoResolveAtIso: new Date(Date.now() + 120_000).toISOString(), params: { threadId, turnId: 'turn', itemId: `question-${id}`, questions, isBlocking: false }, ...extra }
    state.emit('server/request', state.request)
  }
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== new URL(baseUrl).origin) return route.abort()
    if (!url.pathname.startsWith('/codex-api/')) return route.continue()
    state.counts[url.pathname] = (state.counts[url.pathname] || 0) + 1
    if (url.pathname === '/codex-api/rpc') {
      const { method } = request.postDataJSON()
      let result = {}
      if (method === 'thread/list') result = { data: [{ ...thread, turns: [] }], nextCursor: null }
      if (method === 'thread/read' || method === 'thread/resume') result = { thread }
      if (method === 'config/read') result = { config: { model: 'gpt-5.4' } }
      if (method === 'model/list') result = { data: [{ id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4', supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] }
      if (method === 'account/read') result = { account: { type: 'apiKey' }, requiresOpenaiAuth: false }
      if (method === 'skills/list') result = { data: [] }
      return route.fulfill(json({ result }))
    }
    if (url.pathname === '/codex-api/server-requests/pending') return route.fulfill(json({ data: state.request ? [state.request] : [] }))
    if (url.pathname === '/codex-api/server-requests/snooze') {
      state.snoozes.push(request.postDataJSON())
      if (state.failSnooze) return route.fulfill(json({ error: 'synthetic failure' }, 503))
      if (state.request) { state.request.autoResolveAtIso = null; state.emit('server/request', state.request) }
      return route.fulfill(json({ ok: true }))
    }
    if (url.pathname === '/codex-api/server-requests/respond') {
      state.replies.push(request.postDataJSON())
      if (state.replyStatus !== 200) return route.fulfill(json({ error: state.replyStatus === 409 ? 'This request has already been resolved.' : 'Synthetic reply failure' }, state.replyStatus))
      state.emit('serverRequest/resolved', { threadId, requestId: state.request.id })
      state.request = null
      return route.fulfill(json({ ok: true }))
    }
    if (url.pathname === '/codex-api/home-directory') return route.fulfill(json({ data: { path: '/tmp' } }))
    if (url.pathname === '/codex-api/workspace-roots-state') return route.fulfill(json({ data: { order: [cwd], active: [cwd], labels: { [cwd]: 'TestChatUserInput' } } }))
    if (url.pathname === '/codex-api/thread-titles') return route.fulfill(json({ data: { titles: {}, order: [] } }))
    return route.fulfill(json({ data: {} }))
  })
  await page.goto(`${baseUrl}/#/thread/${threadId}`)
  await page.waitForFunction(() => document.querySelector('.thread-composer-input'))
  await connected
  return { page, state }
}

;(async () => {
  mkdirSync(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const report = { baseUrl, viewport, scenarios: [] }
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport })
      const { page, state } = await setup(context, theme)
      const panel = page.locator('.thread-pending-request-shell--questions')
      state.ask(71)
      await panel.waitFor()
      assert.equal(await panel.locator('input[type=radio]').count(), 4)
      assert.equal(await panel.locator('input[type=radio]:checked').count(), 2)
      assert.equal(await panel.locator('textarea').count(), 2, 'Custom answers are available without isOther')
      await page.waitForTimeout(2200)
      const initialSeconds = Number((await panel.locator('[role=status]').innerText()).match(/\d+/)[0])
      assert(initialSeconds <= 120 && initialSeconds >= 110)
      const screenshot = resolve(outputDir, `${theme}.png`)
      await page.screenshot({ path: screenshot })
      const background = await panel.evaluate(element => getComputedStyle(element).backgroundColor)
      assert(theme === 'dark' ? /^(rgb\(24, 24, 27\)|oklch\(0\.21 )/.test(background) : background === 'rgb(255, 255, 255)', background)
      const deadline = state.request.autoResolveAtIso
      await page.reload()
      await panel.waitFor()
      assert.equal(state.request.autoResolveAtIso, deadline, 'Reload preserves the server deadline')
      await panel.locator('textarea').first().fill('我希望复用现有组件。')
      await panel.locator('[role=status]').waitFor({ state: 'hidden' })
      assert.equal(state.snoozes.length, 1)
      assert.equal(await panel.locator('input[type=radio]:checked').count(), 1, 'Custom answer replaces the default')
      await panel.locator('input[type=radio]').nth(1).check()
      assert.equal(await panel.locator('textarea').first().inputValue(), '')
      await panel.locator('textarea').first().fill('自拟方案\n保留现有协议')
      await panel.locator('input[type=radio]').nth(3).check()
      assert.equal(state.snoozes.length, 1, 'Editing makes no per-keystroke network requests')
      await panel.locator('.thread-pending-request-primary').click()
      await panel.waitFor({ state: 'hidden' })
      assert.deepEqual(state.replies.at(-1).result, { answers: { approach: { answers: ['自拟方案\n保留现有协议'] }, validation: { answers: ['手动验证'] } } })
      state.ask(72, { autoResolveAtIso: undefined, params: { threadId, turnId: 'turn', isBlocking: true, questions: [{ id: 'secret', header: 'Token', question: 'Enter token', isSecret: true, options: null }] } })
      await panel.waitFor()
      assert(await panel.locator('.thread-pending-request-primary').isDisabled())
      assert.equal(await panel.locator('input[type=password]').count(), 1)
      assert.equal(await panel.locator('[role=status]').count(), 0)
      await panel.locator('input[type=password]').fill('synthetic-test-secret')
      await panel.locator('.thread-pending-request-primary').click()
      await panel.waitFor({ state: 'hidden' })
      assert.deepEqual(state.replies.at(-1).result, { answers: { secret: { answers: ['synthetic-test-secret'] } } })
      state.ask(73)
      await panel.waitFor()
      state.request = null
      state.emit('serverRequest/resolved', { threadId, requestId: 73 })
      await panel.waitFor({ state: 'hidden' })
      state.ask(74)
      await panel.waitFor()
      state.failSnooze = true
      await panel.locator('textarea').first().fill('保留我的草稿')
      await panel.locator('[role=alert]').waitFor()
      assert(await panel.locator('[role=status]').isVisible(), 'Pause failure leaves the countdown visible')
      state.failSnooze = false
      await panel.locator('[role=alert] button').click()
      await panel.locator('[role=status]').waitFor({ state: 'hidden' })
      state.replyStatus = 500
      await panel.locator('.thread-pending-request-primary').click()
      await page.waitForTimeout(300)
      assert.equal(await panel.locator('textarea').first().inputValue(), '保留我的草稿', 'Failed submission retains the answer for retry')
      state.replyStatus = 409
      await panel.locator('.thread-pending-request-primary').click()
      await panel.waitFor({ state: 'hidden' })
      assert.equal(state.errors.length, 0, state.errors.join('\n'))
      report.scenarios.push({ theme, screenshot, background, initialSeconds, replies: state.replies.length, snoozes: state.snoozes.length, apiCounts: state.counts, pageErrors: state.errors })
      await context.close()
    }
    writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
