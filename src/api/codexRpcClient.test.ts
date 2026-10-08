import { afterEach, expect, it, vi } from 'vitest'
import { rpcCall } from './codexRpcClient'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('bounds a stalled send and reports a lost acknowledgement without retrying', async () => {
  const controller = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Send timed out')))
  }))
  vi.stubGlobal('fetch', fetchMock)
  const pending = rpcCall('turn/start', { threadId: 'test', input: [{ type: 'text', text: 'retain me' }] })
  const failed = expect(pending).rejects.toMatchObject({ message: 'Send timed out', code: 'network_error' })
  controller.abort()
  await failed
  expect(timeout).toHaveBeenCalledWith(60_000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
