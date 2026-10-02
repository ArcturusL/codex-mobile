const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

// All API requests and WebSockets are intercepted before navigating the real app.
// Point BASE_URL at this worktree's isolated Vite server, never a deployed service.
const baseUrl = process.env.BASE_URL || process.env.CODEXUI_BASE_URL || 'http://127.0.0.1:4174'
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname), 'Use a loopback verification server')
const outputDir = resolve('output/playwright/activity-history')
const threadId = '0195f727-b3ce-7843-bcb7-04b36dc70543'
const cwd = '/tmp/TestChatActivityHistory'
const marker = `ACTIVITY_HISTORY_${Date.now()}`
const historyCases = [
  { id: 'history-first', reasoning: ['FIRST_REASONING inspect configuration', 'FIRST_FOLLOWUP verify the command result'], command: 'printf FIRST_COMMAND', output: 'FIRST_OUTPUT configuration verified\n', exitCode: 0, status: 'completed', final: 'FIRST_FINAL Configuration verified.' },
  { id: 'history-failed', reasoning: ['SECOND_REASONING reproduce the failure'], command: 'sh -c "printf SECOND_COMMAND; exit 7"', output: 'SECOND_OUTPUT expected failure details\n', exitCode: 7, status: 'failed', final: 'SECOND_FINAL The command failed with exit code 7.' },
  { id: 'history-reasoning-only', reasoning: ['THIRD_REASONING historical summary without a command, answer, or timing'], final: null },
]
const liveCase = { id: 'history-live', reasoning: ['LIVE_REASONING inspect the next turn'], command: 'printf LIVE_COMMAND', output: 'LIVE_OUTPUT streamed command result\n', exitCode: 0, status: 'completed', final: 'LIVE_FINAL Completed with retained activity.' }

function userItem(id, text) { return { id: `${id}-user`, type: 'userMessage', content: [{ type: 'text', text }] } }
function reasoningItem(id, text) { return { id, type: 'reasoning', summary: [text], content: [] } }
function commandItem(test, status = test.status) { return { id: `${test.id}-command`, type: 'commandExecution', command: test.command, cwd, status, aggregatedOutput: status === 'inProgress' ? '' : test.output, exitCode: status === 'inProgress' ? null : test.exitCode } }
function json(body) { return { status: 200, contentType: 'application/json', body: JSON.stringify(body) } }
function makeHistory() {
  return historyCases.map((test, index) => ({
    id: test.id,
    status: 'completed',
    ...(index < 2 ? { startedAt: '2026-09-12T01:00:00.000Z', completedAt: '2026-09-12T01:00:04.000Z' } : {}),
    items: [userItem(test.id, `${marker} request ${index + 1}`), reasoningItem(`${test.id}-reasoning-0`, test.reasoning[0]),
      ...(test.command ? [commandItem(test)] : []),
      ...test.reasoning.slice(1).map((text, number) => reasoningItem(`${test.id}-reasoning-${number + 1}`, text)),
      ...(test.final ? [{ id: `${test.id}-answer`, type: 'agentMessage', text: test.final }] : [])],
  }))
}
function thread(state, turns = state.turns) {
  return { id: threadId, name: 'TestChat activity history', preview: marker, cwd, updatedAt: 1789170000, createdAt: 1789169000, modelProvider: 'openai', model: 'gpt-5.4', path: null, cliVersion: 'mock', source: 'appServer', gitInfo: { branch: 'main' }, status: state.active ? 'inProgress' : 'completed', inProgress: state.active, turns }
}

async function setup(context, page, theme) {
  const state = { turns: makeHistory(), active: false, sent: [], rpcCounts: {}, apiCounts: {}, externalRequests: [], pageErrors: [], websocketUrls: [] }
  await context.addInitScript(({ threadId, theme }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
    window.__activityLongTasks = []
    new PerformanceObserver((list) => window.__activityLongTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })))).observe({ type: 'longtask', buffered: true })
  }, { threadId, theme })
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await page.routeWebSocket('**/*', (socket) => {
    state.websocketUrls.push(socket.url())
    if (new URL(socket.url()).pathname === '/codex-api/ws') state.socket = socket
    // Do not connectToServer, including for Vite's development WebSocket.
  })
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
          assert(!state.active, 'No duplicate turn start')
          state.sent.push(payload.params)
          state.active = true
          state.turns.push({ id: liveCase.id, status: 'inProgress', startedAt: new Date().toISOString(), items: [{ id: `${liveCase.id}-user`, type: 'userMessage', content: payload.params.input }] })
          result = { turn: state.turns.at(-1) }
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
      case '/codex-api/workspace-roots-state': body = { data: { order: [cwd], labels: { [cwd]: 'TestChatActivityHistory' }, active: [cwd] } }; break
      case '/codex-api/thread-titles': body = { data: { titles: {}, order: [] } }; break
      case '/codex-api/transport-diagnostics':
      case '/codex-api/system-row-diagnostics': body = { ok: true }; break
    }
    return route.fulfill(json(body))
  })
  state.emit = (method, params) => {
    assert(state.socket, 'Stubbed application WebSocket connected')
    state.socket.send(JSON.stringify({ method, params: { threadId, turnId: liveCase.id, ...params }, atIso: new Date().toISOString() }))
  }
  return state
}

const workedSelector = '.conversation-item[data-message-type="worked"]'
async function waitForWorkedCount(page, count) {
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: workedSelector, count }, { timeout: 15000 })
}
async function openWorked(page, index) {
  const turnId = typeof index === 'string' ? index : [...historyCases, liveCase][index].id
  const row = page.locator(`${workedSelector}[data-turn-id="${turnId}"]`)
  if (!await row.locator('.worked-details').count()) await row.locator('.worked-separator').click()
  await row.locator('.worked-details').waitFor()
  return row
}
async function assertHistory(page, cases) {
  await waitForWorkedCount(page, cases.length)
  const reports = []
  for (const [index, test] of cases.entries()) {
    const row = await openWorked(page, index)
    const details = row.locator('.worked-details')
    if (test.final) {
      const finalRow = page.locator(`.conversation-item[data-turn-id="${test.id}"][data-role="assistant"]`).filter({ hasText: test.final })
      await finalRow.waitFor()
      assert.equal(await finalRow.count(), 1, `${test.id}: one final answer in this turn`)
      const workedBeforeFinal = await row.evaluate((element, { turnId, final }) => {
        const answer = [...element.parentElement.querySelectorAll('.conversation-item[data-role="assistant"]')]
          .find((candidate) => candidate.dataset.turnId === turnId && candidate.textContent.includes(final))
        return !!answer && !!(element.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING)
      }, { turnId: test.id, final: test.final })
      assert(workedBeforeFinal, `${test.id}: worked history precedes this turn's final answer`)
    }
    assert.equal(await details.locator('.worked-reasoning').count(), test.reasoning.length, `${test.id}: reasoning summaries appear once`)
    for (const text of test.reasoning) assert((await details.innerText()).includes(text), `${test.id}: retained reasoning ${text}`)
    assert.equal(await details.locator('.cmd-label').count(), test.command ? 1 : 0, `${test.id}: only this turn's command`)
    if (test.command) {
      const command = details.locator('.cmd-row')
      assert.equal(await command.locator('.cmd-label').innerText(), test.command)
      if (!await command.evaluate((element) => element.classList.contains('cmd-expanded'))) await command.click()
      await details.locator('.cmd-output-wrap.cmd-output-visible').waitFor()
      assert.equal(await details.locator('.cmd-output:not(.cmd-execution-meta)').textContent(), test.output)
      if (test.exitCode) assert(/(?:Exit|exit(?: code)?)\s*[:：]?\s*7\b/.test(await details.innerText()), 'Failed command exposes exit code 7')
    }
    const text = await details.innerText()
    for (const other of cases.filter((item) => item !== test)) {
      for (const summary of other.reasoning) assert(!text.includes(summary), `${test.id}: no reasoning from ${other.id}`)
      if (other.command) assert(!text.includes(other.command), `${test.id}: no command from ${other.id}`)
    }
    reports.push({ turnId: test.id, reasoningCount: test.reasoning.length, commandCount: test.command ? 1 : 0, reasoning: await details.locator('.worked-reasoning .plan-card-markdown').allTextContents(), command: await details.locator('.cmd-label').allTextContents(), metadata: await details.locator('.cmd-execution-meta').allTextContents(), output: await details.locator('.cmd-output:not(.cmd-execution-meta)').allTextContents() })
  }
  assert.equal(await page.locator('.conversation-item[data-message-type="commandExecution"]').count(), 0, 'Archived commands are not duplicated outside worked details')
  assert.equal(await page.locator('.conversation-item[data-message-type="agentReasoning"]').count(), 0, 'Archived reasoning is not duplicated outside worked details')
  return reports
}

async function runLiveTurn(page, state) {
  await page.locator('.thread-composer-input').fill(`${marker} live request`)
  await page.locator('.thread-composer-submit').click()
  await page.waitForFunction(() => !document.querySelector('.thread-composer-input')?.value)
  assert.equal(state.sent.length, 1)
  assert(state.sent[0].input.some((input) => input.text?.includes(marker)), 'Unique marker submitted only to the stub')
  const turn = state.turns.at(-1)
  state.emit('turn/started', { turn })
  const reasoning = reasoningItem(`${liveCase.id}-reasoning`, liveCase.reasoning[0])
  turn.items.push(reasoning)
  state.emit('item/started', { item: { ...reasoning, summary: [] } })
  state.emit('item/reasoning/summaryTextDelta', { itemId: reasoning.id, summaryIndex: 0, delta: liveCase.reasoning[0] })
  await page.locator('.live-overlay-reasoning').filter({ hasText: liveCase.reasoning[0] }).waitFor()
  state.emit('item/completed', { item: reasoning })
  const command = commandItem(liveCase, 'inProgress')
  turn.items.push(command)
  state.emit('item/started', { item: command })
  const liveRow = page.locator('.conversation-item[data-message-type="commandExecution"]').filter({ hasText: liveCase.command })
  await liveRow.locator('.cmd-status-running').waitFor()
  command.aggregatedOutput = liveCase.output
  state.emit('item/commandExecution/outputDelta', { itemId: command.id, delta: liveCase.output })
  const button = liveRow.locator('.cmd-row')
  if (!await button.evaluate((element) => element.classList.contains('cmd-expanded'))) await button.click()
  await page.waitForFunction((text) => [...document.querySelectorAll('.cmd-output-wrap.cmd-output-visible .cmd-output')].some((element) => element.textContent.includes(text)), liveCase.output.trim())
  const liveVisible = { command: await button.innerText(), output: await liveRow.locator('.cmd-output:not(.cmd-execution-meta)').innerText() }
  Object.assign(command, commandItem(liveCase))
  state.emit('item/completed', { item: command })
  const answer = { id: `${liveCase.id}-answer`, type: 'agentMessage', text: liveCase.final }
  turn.items.push(answer)
  state.emit('item/completed', { item: answer })
  turn.status = 'completed'
  turn.completedAt = new Date().toISOString()
  state.active = false
  state.emit('turn/completed', { turn })
  await page.locator('.message-row[data-role="assistant"]').filter({ hasText: liveCase.final }).waitFor()
  await waitForWorkedCount(page, historyCases.length + 1)
  await page.locator('.live-overlay-inline').waitFor({ state: 'hidden' })
  return liveVisible
}

function counterDelta(before, after) { return Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] || 0)]).filter(([, value]) => value)) }
async function profileToggles(page, state) {
  // Wait for event-driven persistence sync before measuring purely local toggles.
  await page.waitForTimeout(2500)
  const beforeRpc = { ...state.rpcCounts }
  const beforeApi = { ...state.apiCounts }
  await page.evaluate(() => { window.__activityLongTasks = [] })
  const durations = await page.locator(workedSelector).first().evaluate(async (row) => {
    const button = row.querySelector('.worked-separator')
    const samples = []
    for (let index = 0; index < 20; index++) {
      const started = performance.now()
      button.click()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      samples.push(performance.now() - started)
    }
    return samples
  })
  const rpcDelta = counterDelta(beforeRpc, state.rpcCounts)
  const apiDelta = counterDelta(beforeApi, state.apiCounts)
  assert.deepEqual(rpcDelta, {}, 'Opening and closing history issues no RPC')
  const longTasks = await page.evaluate(() => window.__activityLongTasks)
  return { toggles: durations.length, toggleToPaintMs: durations, maxMs: Math.max(...durations), averageMs: durations.reduce((sum, value) => sum + value, 0) / durations.length, rpcDelta, apiDelta, longTasks }
}

async function assertLargeTurn(page, state) {
  const id = 'history-large'
  const first = { ...historyCases[0], id: 'large-first', command: 'printf LARGE_FIRST_COMMAND', output: 'LARGE_FIRST_OUTPUT\n' }
  const last = { ...historyCases[0], id: 'large-last', command: 'printf LARGE_LAST_COMMAND', output: 'LARGE_LAST_OUTPUT\n' }
  const summaries = Array.from({ length: 60 }, (_, index) => reasoningItem(`large-reasoning-${index}`, `LARGE_REASONING_${index} retained summary`))
  state.turns = [{ id, status: 'completed', items: [userItem(id, `${marker} large history`), commandItem(first), ...summaries, commandItem(last), { id: 'large-answer', type: 'agentMessage', text: 'LARGE_FINAL all activity remains accessible' }] }]
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForWorkedCount(page, 1)
  const answer = page.locator('.message-row[data-role="assistant"]').filter({ hasText: 'LARGE_FINAL' })
  await answer.waitFor()
  assert.equal(await page.locator('.worked-details').count(), 0, 'Large activity history is initially collapsed')
  const row = await openWorked(page, id)
  assert.equal(await row.locator('.worked-reasoning').count(), 60, 'Every summary survives the 50-message render window')
  assert.equal(await row.locator('.cmd-label').count(), 2)
  assert((await row.innerText()).includes('LARGE_REASONING_0 retained summary'))
  assert((await row.innerText()).includes('LARGE_REASONING_59 retained summary'))
  for (const test of [first, last]) {
    const item = row.locator('.worked-cmd-item').filter({ has: page.locator('.cmd-label', { hasText: test.command }) })
    await item.locator('.cmd-row').click()
    assert.equal(await item.locator('.cmd-output:not(.cmd-execution-meta)').textContent(), test.output)
  }
  const performance = await profileToggles(page, state)
  await answer.scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)
  const screenshot = resolve(outputDir, 'large-history-light-375x812.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  return { activityCount: 62, reasoningCount: 60, commandCount: 2, firstAndLastAccessible: true, finalAnswerVisible: true, performance, screenshot }
}

async function run(browser, viewport, theme) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const state = await setup(context, page, theme)
  const url = `${baseUrl}/#/thread/${threadId}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('.thread-composer-input').waitFor({ timeout: 30000 })
    const initial = await assertHistory(page, historyCases)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const historicalReload = await assertHistory(page, historyCases)
    assert.deepEqual(historicalReload, initial, 'Historical records restored after refresh')
    const liveVisible = await runLiveTurn(page, state)
    const completed = await assertHistory(page, [...historyCases, liveCase])
    await page.reload({ waitUntil: 'domcontentloaded' })
    const completedReload = await assertHistory(page, [...historyCases, liveCase])
    assert.deepEqual(completedReload, completed, 'Completed live activity and prior turns survive refresh unchanged')
    const performance = await profileToggles(page, state)
    const appearance = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      surfaces: [...document.querySelectorAll('.worked-details, .worked-reasoning, .worked-details .cmd-output')].map((element) => ({ className: element.className, color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, width: element.getBoundingClientRect().width })),
    }))
    assert.equal(appearance.dark, theme === 'dark', 'Requested theme is active')
    assert(!appearance.pageOverflow, 'History details do not overflow the viewport')
    const screenshots = []
    await page.waitForTimeout(2500)
    for (const [index, test] of [...historyCases, liveCase].entries()) {
      const row = await openWorked(page, index)
      const screenshot = resolve(outputDir, `${test.id}-${theme}-${viewport.width}x${viewport.height}.png`)
      await row.screenshot({ path: screenshot })
      screenshots.push(screenshot)
    }
    const screenshot = resolve(outputDir, `activity-history-${theme}-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    screenshots.push(screenshot)
    const largeTurn = theme === 'light' && viewport.width === 375 ? await assertLargeTurn(page, state) : null
    assert.deepEqual(state.externalRequests, [], 'No external runtime requests')
    assert.deepEqual(state.pageErrors, [], 'No browser errors')
    assert.equal(state.sent.length, 1, 'Exactly one mocked live turn sent')
    return { url, viewport, theme, marker, initial, historicalReload, liveVisible, completedReload, reloadOk: true, sentCount: state.sent.length, appearance, performance, largeTurn, screenshots, rpcCounts: state.rpcCounts, apiCounts: state.apiCounts, websocketUrls: state.websocketUrls, externalRequests: state.externalRequests }
  } catch (error) {
    const screenshot = resolve(outputDir, `failure-${theme}-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})
    writeFileSync(resolve(outputDir, 'failure.json'), JSON.stringify({ url, viewport, theme, error: String(error), screenshot, pageErrors: state.pageErrors, rpcCounts: state.rpcCounts, apiCounts: state.apiCounts, externalRequests: state.externalRequests }, null, 2))
    console.error(`Failure screenshot: ${screenshot}`)
    throw error
  } finally {
    await context.close()
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const reports = []
  try {
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
      for (const theme of ['light', 'dark']) {
        const report = await run(browser, viewport, theme)
        reports.push(report)
        console.log(JSON.stringify({ url: report.url, viewport, theme, reloadOk: report.reloadOk, turns: report.completedReload.length, performance: report.performance, screenshots: report.screenshots }))
      }
    }
  } finally {
    writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(reports, null, 2))
    await browser.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
