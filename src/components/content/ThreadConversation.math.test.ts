import vue from '@vitejs/plugin-vue'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'

let server: ViteDevServer
let conversation: Component

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    plugins: [vue()],
    server: { middlewareMode: true, hmr: false },
    logLevel: 'error',
  })
  conversation = (await server.ssrLoadModule('/src/components/content/ThreadConversation.vue')).default
}, 15_000)

afterAll(async () => { await server?.close() })

function renderMessage(text: string): Promise<string> {
  return renderToString(createSSRApp(conversation, {
    messages: [{ id: 'math-test', role: 'assistant', messageType: 'agentMessage', text }],
    pendingRequests: [], liveOverlay: null, isLoading: false,
    activeThreadId: 'math-test', cwd: '/tmp/TestChat',
  }))
}

describe('ThreadConversation math integration', () => {
  it.each([
    ['**result $x$**', 'strong'],
    ['**$x$**', 'strong'],
    ['*sum $x+y$*', 'em'],
    ['~~$x$~~', 's'],
  ])('keeps emphasis around formulas in %s', async (text, tag) => {
    const html = await renderMessage(text)
    expect(html).toContain(`<${tag}><span class="katex">`)
    expect(html).not.toContain('**')
    expect(html).not.toContain('~~')
    expect(html).not.toContain('*sum')
  })

  it('preserves surrounding Markdown, code, links, and table formula pipes', async () => {
    const html = await renderMessage('**bold** and *italic* and ~~strike~~ $x$ `$x$`\n\n'
      + '[formula.md](/tmp/TestChat/formula.md)\n\n| Value | Meaning |\n| --- | --- |\n| $|x|$ | absolute value |')
    expect(html).toMatch(/class="message-bold-text"[^>]*>bold<\/strong>/u)
    expect(html).toMatch(/class="message-italic-text"[^>]*>italic<\/em>/u)
    expect(html).toMatch(/class="message-strikethrough-text"[^>]*>strike<\/s>/u)
    expect(html).toMatch(/class="message-inline-code"[^>]*>\$x\$<\/code>/u)
    expect(html).toContain('href="/codex-local-browse/tmp/TestChat/formula.md"')
    expect(html).toContain('title="/tmp/TestChat/formula.md"')
    expect(html).toContain('<annotation encoding="application/x-tex">|x|</annotation>')
    expect(html.match(/<td\b/gu)).toHaveLength(2)
  })

  it.each([
    '- $$\n  x^2\n  $$\n- next\n\nAfter',
    '1. \\[\n   x^2\n   \\]\n2. next\n\nAfter',
  ])('keeps list display formulas and following content intact', async (text) => {
    const html = await renderMessage(text)
    expect(html).toMatch(/<annotation encoding="application\/x-tex">\s*x\^2\s*<\/annotation>/u)
    expect(html.match(/<li class="message-list-item"/gu)).toHaveLength(2)
    expect(html).toContain('next')
    expect(html).toMatch(/class="message-text"[^>]*>.*After/u)
    expect(html).not.toContain('katex-error')
  })

  it('keeps unfinished streaming formulas readable until the delimiter closes', async () => {
    const partial = await renderMessage('Result: $x^2')
    expect(partial).toContain('$x^2')
    expect(partial).not.toContain('class="katex"')
    expect(await renderMessage('Result: $x^2$')).toContain('<annotation encoding="application/x-tex">x^2</annotation>')
  })
})
