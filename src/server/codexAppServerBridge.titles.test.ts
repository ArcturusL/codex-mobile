import { expect, it, vi } from 'vitest'
import { generateConversationTitle } from './codexAppServerBridge'

it('generates a bounded title in an isolated helper and deduplicates concurrent requests', async () => {
  let notify: (event: { method: string; params: unknown }) => void = () => {}
  const unsubscribe = vi.fn()
  const helper = {
    dispose: vi.fn(),
    onNotification: vi.fn((handler: typeof notify) => { notify = handler; return unsubscribe }),
    rpc: vi.fn(async (method: string) => {
      if (method === 'config/read') return { config: { mcp_servers: { example: {} } } }
      if (method === 'thread/start') return { thread: { id: 'helper' } }
      if (method === 'turn/start') {
        notify({ method: 'item/completed', params: { threadId: 'helper', item: { type: 'agentMessage', text: '{"title":"  Vue   计算属性  "}' } } })
        notify({ method: 'turn/completed', params: { threadId: 'helper', turn: { status: 'completed' } } })
      }
      return {}
    }),
  }
  const factory = vi.fn(() => helper)
  const params = { threadId: 'source', prompt: 'Explain Vue computed', model: 'gpt-5.5', modelProvider: 'codex' }
  const result = generateConversationTitle(params, factory)
  expect(generateConversationTitle(params, factory)).toBe(result)
  await expect(result).resolves.toBe('Vue 计算属性')
  expect(factory).toHaveBeenCalledTimes(1)
  expect(helper.rpc).toHaveBeenCalledWith('thread/start', expect.objectContaining({
    ephemeral: true, modelProvider: 'openai', approvalPolicy: 'never',
    config: expect.objectContaining({ 'mcp_servers.example.enabled': false, 'features.shell_tool': false }),
  }))
  expect(helper.dispose).toHaveBeenCalledTimes(1)
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
