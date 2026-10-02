const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.CODEXUI_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = resolve('output/playwright')
const threadId = '0195f727-b3ce-b843-bcb7-04b36dc70542'
const cwd = '/tmp/TestChat'
const filePath = `${cwd}/formula.md`
const marker = `TESTCHAT_MATH_${Date.now()}`
const content = String.raw`${marker}

Inline $x^2$ and \(\frac{a}{b}\). 反推与宏观应当是 $\left(x_i\right)^{l}_{j}$。这能解释。

确定：**每件样品以首次老练前的初次闪络电压 \(U_0\) 为固定基准**。初次老练和重新预处理后的再次老练，均采用同一目标电压，例如 \(1.30U_0\)，分别记录所需时间和闪络次数。

下一问：**某一次闪络电压达到目标就结束，还是需要连续若干次达到目标才算完成？** 这条用于明确新的老练结束判据。

**Result $u^2$** *sum $v^2$* ~~$w^2$~~

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

\[
\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
\]

- List formula $a_i^2+b_i^2=c_i^2$.

- $$
  x^3
  $$

1. \[
   y^3
   \]

| Kind | Value |
| --- | --- |
| Table | $\sqrt{2}$ |
| Absolute value | $|x|$ |

Literal money: \$5, $10 and $20. Inline code: ` + '`$x^2$`' + String.raw`.

` + '```sh\necho "$HOME $x^2$"\n```' + `\n\n[formula.md](${filePath})\n\n` + String.raw`Long formula:

$$
\underbrace{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}+a_{17}+a_{18}+a_{19}+a_{20}}_{\text{scroll horizontally}}
$$`

function json(body) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

function thread(state, turns = state.turns) {
  return { id: threadId, name: 'TestChat math rendering', preview: marker, cwd, updatedAt: 1774680300, createdAt: 1774680000, modelProvider: 'openai', model: 'gpt-5.4', path: null, cliVersion: 'mock', source: 'appServer', gitInfo: { branch: 'main' }, status: state.active ? 'inProgress' : 'completed', inProgress: state.active, turns }
}

async function setup(context, page, theme) {
  const state = { turns: [], active: false, sent: [], rpcCounts: {}, apiCounts: {}, externalRequests: [], pageErrors: [] }
  await context.addInitScript(({ threadId, theme }) => {
    localStorage.setItem('codex-web-local.selected-thread-id.v1', threadId)
    localStorage.setItem('codex-web-local.dark-mode.v1', theme)
    window.__mathLongTasks = []
    new PerformanceObserver((list) => window.__mathLongTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })))).observe({ type: 'longtask', buffered: true })
  }, { threadId, theme })
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
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
          state.turns = [{ id: 'math-turn', status: 'inProgress', items: [{ id: 'math-user', type: 'userMessage', content: payload.params.input }] }]
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
    state.socket.send(JSON.stringify({ method, params: { threadId, turnId: 'math-turn', ...params }, atIso: new Date().toISOString() }))
  }
  return state
}

async function assertRendered(page) {
  const row = page.locator('.message-row[data-role="assistant"]').filter({ hasText: marker }).last()
  await row.locator('.katex').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  const evidence = await row.evaluate((element, { filePath, marker }) => {
    const annotations = [...element.querySelectorAll('annotation')].map((node) => node.textContent.trim())
    const link = element.querySelector('a.message-file-link[title="' + filePath + '"]')
    const displays = [...element.querySelectorAll('.message-math-display')].map((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, overflowX: getComputedStyle(node).overflowX }))
    return {
      hrefOk: link?.getAttribute('href') === '/codex-local-browse' + filePath,
      titleOk: link?.getAttribute('title') === filePath,
      textOk: link?.textContent.trim() === 'formula.md' && element.textContent.includes(marker),
      annotations,
      codeOk: [...element.querySelectorAll('code')].some((node) => node.textContent === '$x^2$') && element.textContent.includes('echo "$HOME $x^2$"'),
      moneyOk: element.textContent.includes('$5, $10 and $20'),
      tableOk: !!element.querySelector('td .katex') && [...element.querySelectorAll('tbody tr')].every((row) => row.children.length === 2),
      listOk: !!element.querySelector('li .katex'),
      emphasisDetail: { strong: element.querySelectorAll('strong .katex').length, em: element.querySelectorAll('em .katex').length, s: element.querySelectorAll('s .katex').length, literalMarkers: [...element.querySelectorAll('.message-text')].filter((node) => node.textContent.includes('**')).map((node) => node.textContent) },
      emphasisOk: !!element.querySelector('strong .katex') && !!element.querySelector('em .katex') && !!element.querySelector('s .katex') && !element.textContent.includes('**'),
      displays,
      inlineMotion: [...element.querySelectorAll('.message-math:not(.message-math-display)')].map((node) => {
        const formula = node.querySelector('.katex-html')
        const before = formula.getBoundingClientRect().left
        node.scrollLeft = 40
        const moved = formula.getBoundingClientRect().left - before
        const scrollLeft = node.scrollLeft
        node.scrollLeft = 0
        return { formula: node.querySelector('annotation').textContent, overflowX: getComputedStyle(node).overflowX, scrollLeft, moved, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }
      }),
      scrollbarsHidden: [...element.querySelectorAll('.message-math')].every((node) => (
        getComputedStyle(node).scrollbarWidth === 'none'
        && getComputedStyle(node, '::-webkit-scrollbar').display === 'none'
        && (getComputedStyle(node).display === 'inline' || node.offsetHeight === node.clientHeight)
      )),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      invalidMath: element.querySelectorAll('.katex-error').length,
      dark: document.documentElement.classList.contains('dark'),
      color: getComputedStyle(element.querySelector('.katex')).color,
    }
  }, { filePath, marker })
  for (const key of ['hrefOk', 'titleOk', 'textOk', 'codeOk', 'moneyOk', 'tableOk', 'listOk', 'emphasisOk', 'scrollbarsHidden']) assert(evidence[key], `${key}: ${JSON.stringify(evidence)}`)
  for (const formula of ['x^2', '\\frac{a}{b}', '\\int_0^1 x^2\\,dx=\\frac{1}{3}', '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}', 'a_i^2+b_i^2=c_i^2', '\\sqrt{2}', '|x|', 'x^3', 'y^3', 'u^2', 'v^2', 'w^2']) assert(evidence.annotations.includes(formula), `Missing rendered formula: ${formula}`)
  assert(evidence.inlineMotion.every((node) => node.scrollLeft === 0 && node.moved === 0 && node.overflowX === 'visible'), 'Inline formulas must not be scroll containers: ' + JSON.stringify(evidence.inlineMotion))
  assert(evidence.annotations.includes('U_0') && evidence.annotations.includes('1.30U_0'), 'User sample renders both inline formulas')
  assert(!evidence.pageOverflow, 'Page must not overflow horizontally')
  assert.equal(evidence.invalidMath, 0)
  assert(evidence.displays.some((row) => row.scrollWidth > row.clientWidth && ['auto', 'scroll'].includes(row.overflowX)), 'Long display formula scrolls within its container')
  const scroll = await row.locator('.message-math-display').last().evaluate((node) => {
    node.scrollLeft = 0
    const leftAccessible = node.querySelector('.katex-base, .base').getBoundingClientRect().left >= node.getBoundingClientRect().left - 1
    node.scrollLeft = 40
    const scrollOk = node.scrollLeft > 0
    node.scrollLeft = 0
    return { leftAccessible, scrollOk }
  })
  assert(scroll.scrollOk, 'Long display formula accepts horizontal scrolling')
  assert(scroll.leftAccessible, 'Long display formula left edge stays accessible')
  evidence.scroll = scroll
  const sample = row.locator('.message-math:not(.message-math-display)').filter({ has: page.locator('annotation', { hasText: /^1\.30U_0$/ }) }).first()
  await sample.locator('.katex-base, .base').first().scrollIntoViewIfNeeded()
  const initialLeft = await sample.locator('.katex-html').evaluate((node) => node.getBoundingClientRect().left)
  await sample.locator('.katex-base, .base').first().hover()
  await page.mouse.wheel(80, 0)
  await page.waitForTimeout(100)
  const finalLeft = await sample.locator('.katex-html').evaluate((node) => node.getBoundingClientRect().left)
  assert.equal(finalLeft, initialLeft, 'Horizontal wheel input must not move the inline sample')
  evidence.inlineWheelStationary = true
  await page.evaluate(() => document.fonts.ready)
  evidence.fonts = await page.evaluate(() => ({ loaded: [...document.fonts].filter((font) => /KaTeX/.test(font.family) && font.status === 'loaded').map((font) => font.family), requests: performance.getEntriesByType('resource').filter((entry) => /KaTeX.*\.(woff2?|ttf)/i.test(entry.name)).map((entry) => ({ url: entry.name, duration: entry.duration })) }))
  assert(evidence.fonts.loaded.length > 0, 'KaTeX fonts actually loaded')
  assert(evidence.fonts.requests.length > 0, 'Local KaTeX font assets fetched')
  return evidence
}

async function run(browser, viewport, theme, profile) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const state = await setup(context, page, theme)
  const url = `${baseUrl}/#/thread/${threadId}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('.thread-composer-input').waitFor({ timeout: 30000 })
    await page.locator('.thread-composer-input').fill(content)
    await page.locator('.thread-composer-submit').click()
    await page.waitForFunction(() => !document.querySelector('.thread-composer-input')?.value)
    assert.equal(state.sent.length, 1, 'One TestChat send')
    assert(state.sent[0].input.some((input) => input.text?.includes(marker)), 'Unique marker sent with representative markdown')
    state.emit('turn/started', { turn: state.turns[0] })
    state.emit('item/started', { item: { id: 'math-answer', type: 'agentMessage', text: '' } })
    const partial = `${marker} streaming: $\\frac{a`
    state.emit('item/agentMessage/delta', { itemId: 'math-answer', delta: partial })
    const answer = page.locator('.message-row[data-role="assistant"]').filter({ hasText: marker }).last()
    await answer.waitFor()
    assert.equal(await answer.locator('.katex').count(), 0, 'Unclosed stream delimiter stays readable text')
    assert((await answer.innerText()).includes('$\\frac{a'), 'Unclosed formula preserves source')
    state.emit('item/agentMessage/delta', { itemId: 'math-answer', delta: '}{b}$' })
    await answer.locator('.katex').waitFor()
    state.emit('item/agentMessage/delta', { itemId: 'math-answer', delta: `\n\n${content}` })
    let finalText = `${partial}}{b}$\n\n${content}`
    await answer.locator('td .katex').first().waitFor()
    const before = { ...state.rpcCounts }
    const beforeApi = { ...state.apiCounts }
    const timings = []
    if (profile) {
      await page.evaluate(() => { window.__mathLongTasks = [] })
      for (let index = 0; index < 20; index++) {
        const delta = `\n\nPerformance ${index}: $\\sum_{i=1}^{${index + 1}} i^2$`
        const started = performance.now()
        state.emit('item/agentMessage/delta', { itemId: 'math-answer', delta })
        await page.waitForFunction((index) => [...document.querySelectorAll('.message-row[data-role="assistant"] annotation')].some((node) => node.textContent === `\\sum_{i=1}^{${index + 1}} i^2`), index)
        timings.push(performance.now() - started)
        finalText += delta
      }
    }
    const during = { ...state.rpcCounts }
    const duringApi = { ...state.apiCounts }
    state.active = false
    const completed = { id: 'math-answer', type: 'agentMessage', text: finalText }
    state.turns[0].items.push(completed)
    state.turns[0].status = 'completed'
    state.emit('item/completed', { item: completed })
    state.emit('turn/completed', { turn: state.turns[0] })
    const evidence = await assertRendered(page)
    assert.equal(evidence.dark, theme === 'dark', 'Requested theme is active')
    const longTasks = await page.evaluate(() => window.__mathLongTasks)
    const beforeReloadAnnotations = evidence.annotations.length
    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloaded = await assertRendered(page)
    assert.equal(reloaded.annotations.length, beforeReloadAnnotations, 'All formulas restored after reload')
    await page.locator('.message-row[data-role="assistant"] .message-text').filter({ hasText: 'Inline' }).first().evaluate((node) => node.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(2500)
    const screenshot = resolve(outputDir, `testchat-math-${theme}-${viewport.width}x${viewport.height}-cjs.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    const conversationScreenshot = resolve(outputDir, `testchat-math-conversation-${theme}-${viewport.width}x${viewport.height}-cjs.png`)
    await page.locator('.conversation-list').screenshot({ path: conversationScreenshot })
    if (theme === 'light' && viewport.width === 1024) await page.screenshot({ path: resolve(outputDir, 'testchat-math-cjs.png'), fullPage: true })
    assert.deepEqual(state.externalRequests, [], 'No external runtime requests')
    assert.deepEqual(state.pageErrors, [], 'No browser errors')
    const renderingRpcDelta = Object.fromEntries(Object.entries(during).map(([key, count]) => [key, count - (before[key] || 0)]).filter(([, count]) => count))
    const renderingApiDelta = Object.fromEntries(Object.entries(duringApi).map(([key, count]) => [key, count - (beforeApi[key] || 0)]).filter(([, count]) => count))
    assert(!renderingRpcDelta['turn/start'], 'Rendering must not send duplicate turns')
    const report = { url, viewport, theme, marker, screenshot, conversationScreenshot, sentCount: state.sent.length, evidence, reloadOk: true, externalRequests: state.externalRequests, pageErrors: state.pageErrors, rpcCounts: state.rpcCounts, apiCounts: state.apiCounts, renderingRpcDelta, renderingApiDelta, performance: { updates: timings.length, updateToDomMs: timings, maxMs: Math.max(0, ...timings), averageMs: timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0, longTasks } }
    await context.close()
    return report
  } catch (error) {
    const failurePath = resolve(outputDir, `testchat-math-failure-${theme}-${viewport.width}.png`)
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {})
    writeFileSync(resolve(outputDir, 'testchat-math-failure.json'), JSON.stringify({ error: String(error), pageErrors: state.pageErrors, rpcCounts: state.rpcCounts, apiCounts: state.apiCounts, externalRequests: state.externalRequests }, null, 2))
    console.error(`Failure screenshot: ${failurePath}`)
    throw error
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const reports = []
  try {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      for (const theme of ['light', 'dark']) {
        const report = await run(browser, viewport, theme, viewport.width === 1024 && theme === 'light')
        reports.push(report)
        console.log(JSON.stringify({ viewport, theme, hrefOk: report.evidence.hrefOk, titleOk: report.evidence.titleOk, textOk: report.evidence.textOk, screenshot: report.screenshot, performance: report.performance }))
      }
    }
  } finally {
    writeFileSync(resolve(outputDir, 'testchat-math-cjs.json'), JSON.stringify(reports, null, 2))
    await browser.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
