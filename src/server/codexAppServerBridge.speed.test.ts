import { describe, expect, it, vi } from 'vitest'
import { applyConfiguredServiceTier } from './codexAppServerBridge'

describe('turn service tier', () => {
  it('reads the latest setting for existing-thread sends and queued turns, including switching Fast off', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ config: { service_tier: 'fast' } })
      .mockResolvedValueOnce({ config: { service_tier: null } })
    const params = { threadId: 'existing-thread', input: [{ type: 'text', text: 'continue' }] }
    await expect(applyConfiguredServiceTier({ rpc }, params)).resolves.toEqual({ ...params, serviceTier: 'fast' })
    await expect(applyConfiguredServiceTier({ rpc }, params)).resolves.toEqual({ ...params, serviceTier: null })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('config/read', { includeLayers: false })
    expect(params).not.toHaveProperty('serviceTier')
  })

  it('preserves explicit per-thread and per-turn overrides without an extra config read', async () => {
    const rpc = vi.fn()
    for (const override of [{ serviceTier: 'fast' }, { serviceTier: null }, { serviceTierForTurn: 'default' }]) {
      const params = { threadId: 'thread-1', ...override }
      await expect(applyConfiguredServiceTier({ rpc }, params)).resolves.toBe(params)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps legacy config responses unchanged and propagates read errors instead of silently using the wrong tier', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ config: {} }).mockRejectedValueOnce(new Error('config unavailable'))
    const params = { threadId: 'thread-1' }
    await expect(applyConfiguredServiceTier({ rpc }, params)).resolves.toBe(params)
    await expect(applyConfiguredServiceTier({ rpc }, params)).rejects.toThrow('config unavailable')
  })
})
