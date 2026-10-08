import { afterEach, expect, test, vi } from 'vitest'
import { createServiceRestarter } from './serviceRestart'

afterEach(() => vi.useRealTimers())

test('confirmed restart waits for all active conversations and queued writes, can be cancelled, and flushes once', async () => {
  vi.useFakeTimers()
  let activeThreads = 2, busyRequests = 1
  const restart = vi.fn(), drain = vi.fn(), interrupt = vi.fn(), flush = vi.fn(async () => {})
  const controller = createServiceRestarter({ restart, drain, interrupt, flush,
    activity: () => ({ activeThreads, busyRequests }), updating: () => false })
  expect(() => controller.request('wait', false)).toThrow('Confirm')
  controller.request('wait', true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(restart).not.toHaveBeenCalled()
  expect(drain).toHaveBeenLastCalledWith(true)
  controller.request('cancel', true)
  expect(drain).toHaveBeenLastCalledWith(false)
  activeThreads = 0
  await vi.advanceTimersByTimeAsync(1000)
  expect(restart).not.toHaveBeenCalled()
  controller.request('wait', true)
  await vi.advanceTimersByTimeAsync(500)
  expect(flush).not.toHaveBeenCalled()
  busyRequests = 0
  await vi.advanceTimersByTimeAsync(500)
  expect(flush).toHaveBeenCalledTimes(1)
  expect(restart).toHaveBeenCalledTimes(1)
  expect(interrupt).not.toHaveBeenCalled()
  controller.request('wait', true)
  await vi.advanceTimersByTimeAsync(2000)
  expect(restart).toHaveBeenCalledTimes(1)
  controller.dispose()
})

test('force interrupts then saves; failed saves and unsupported/updating servers never exit', async () => {
  vi.useFakeTimers()
  let activeThreads = 1, updating = true
  const restart = vi.fn(), drain = vi.fn()
  const interrupt = vi.fn(async () => { activeThreads = 0 })
  const flush = vi.fn(async () => { throw Error('disk unavailable') })
  const options = { restart, drain, interrupt, flush, activity: () => ({ activeThreads, busyRequests: 0 }), updating: () => updating }
  const controller = createServiceRestarter(options)
  expect(() => controller.request('force', true)).toThrow('update to finish')
  updating = false
  controller.request('wait', true)
  controller.request('force', true)
  expect(interrupt).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  expect(interrupt).toHaveBeenCalledTimes(1)
  expect(flush).toHaveBeenCalledTimes(1)
  expect(restart).not.toHaveBeenCalled()
  expect(controller.status()).toMatchObject({ phase: 'idle', error: 'disk unavailable' })
  expect(drain).toHaveBeenLastCalledWith(false)
  flush.mockResolvedValueOnce(undefined as never)
  controller.request('force', true)
  await vi.advanceTimersByTimeAsync(500)
  expect(restart).toHaveBeenCalledTimes(1)
  const unsupported = createServiceRestarter({ ...options, restart: undefined })
  expect(unsupported.status().available).toBe(false)
  expect(() => unsupported.request('force', true)).toThrow('unavailable')
  controller.dispose(); unsupported.dispose()
})
