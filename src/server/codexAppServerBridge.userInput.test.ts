import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppServerProcess } from './codexAppServerBridge'
import { defaultUserInputResponse, readUserInputQuestions, userInputTimeoutMs } from '../shared/userInput'

const questions = [
  { id: 'direction', header: 'Direction', question: 'Which approach?', isOther: false, options: [
    { label: 'Small change (Recommended)', description: 'Reuse the current flow' },
    { label: 'Rewrite', description: 'Replace it' },
  ] },
  { id: 'details', question: 'Any details?', options: null },
]
let server: AppServerProcess
let writes: ReturnType<typeof vi.fn<(payload: Record<string, unknown>) => void>>
let notifications: ReturnType<typeof vi.fn<(notification: { method: string; params: unknown }) => void>>

function request(id = 7, extra: Record<string, unknown> = {}, method = 'item/tool/requestUserInput') {
  server['handleLine'](JSON.stringify({ id, method, params: { threadId: 't', turnId: 'turn', questions, ...extra } }))
}
function notify(method: string, params: unknown) { server['handleLine'](JSON.stringify({ method, params })) }

beforeEach(() => {
  vi.useFakeTimers()
  server = new AppServerProcess()
  writes = vi.fn()
  vi.spyOn(server as unknown as { sendLine(payload: Record<string, unknown>): void }, 'sendLine').mockImplementation(writes)
  notifications = vi.fn()
  server.onNotification(notifications)
})
afterEach(() => { server.dispose(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('official user input lifecycle and Mobile defaults', () => {
  it('uses isBlocking before legacy milliseconds and validates legacy values', () => {
    expect(userInputTimeoutMs({ questions, isBlocking: false, autoResolutionMs: 1 })).toBe(120_000)
    expect(userInputTimeoutMs({ questions, isBlocking: true, autoResolutionMs: 1 })).toBeNull()
    expect(userInputTimeoutMs({ questions, autoResolutionMs: 35_000 })).toBe(35_000)
    expect(userInputTimeoutMs({ questions })).toBe(60_000)
    for (const autoResolutionMs of [null, -1, 1.5, '1000', Infinity, 2_147_483_648]) {
      expect(userInputTimeoutMs({ questions, autoResolutionMs })).toBeNull()
    }
    expect(userInputTimeoutMs({ isBlocking: false, questions: [{}] })).toBeNull()
  })

  it('replies once with first options after the deadline, without needing a browser', async () => {
    request(7, { isBlocking: false })
    const deadline = server.listPendingServerRequests()[0]?.autoResolveAtIso
    expect(Date.parse(deadline!)).toBe(Date.now() + 120_000)
    vi.advanceTimersByTime(119_999)
    expect(writes).not.toHaveBeenCalled()
    expect(server.listPendingServerRequests()[0]?.autoResolveAtIso).toBe(deadline)
    vi.advanceTimersByTime(1)
    expect(writes).toHaveBeenCalledExactlyOnceWith({ jsonrpc: '2.0', id: 7, result: {
      answers: { direction: { answers: ['Small change (Recommended)'] } },
    } })
    expect(server.listPendingServerRequests()).toEqual([])
    expect(notifications).toHaveBeenCalledWith(expect.objectContaining({ method: 'server/request/resolved', params: expect.objectContaining({ mode: 'automatic' }) }))
    await expect(server.respondToServerRequest({ id: 7, result: { answers: {} } })).rejects.toThrow('No pending')
    expect(writes).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps first-choice labels exact and never invents free-text or secret defaults', () => {
    const params = { questions: [...questions, { id: '__proto__', options: [{ label: '  exact  ' }] }, { id: 'token', isSecret: true, options: [{ label: 'secret' }] }] }
    expect(Object.keys(defaultUserInputResponse(params).answers)).toEqual(['direction', '__proto__'])
    expect(defaultUserInputResponse(params).answers['__proto__']).toEqual({ answers: ['  exact  '] })
    expect(readUserInputQuestions(params)[1]?.options).toEqual([])
  })

  it('snoozes once for interaction and preserves the original request across reconnects', () => {
    request()
    const receivedAt = server.listPendingServerRequests()[0]?.receivedAtIso
    vi.advanceTimersByTime(1000)
    server.snoozeUserInputRequest({ id: 7 })
    server.snoozeUserInputRequest({ id: 7 })
    expect(server.listPendingServerRequests()[0]).toMatchObject({ receivedAtIso: receivedAt, autoResolveAtIso: null })
    expect(notifications).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(300_000)
    expect(writes).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the timer for manual answers and passes custom text through', async () => {
    request()
    const result = { answers: { direction: { answers: ['My custom approach'] }, details: { answers: ['More details'] } } }
    await server.respondToServerRequest({ id: 7, result })
    vi.advanceTimersByTime(120_000)
    expect(writes).toHaveBeenCalledExactlyOnceWith({ jsonrpc: '2.0', id: 7, result })
  })

  it.each([
    ['serverRequest/resolved', { threadId: 't', requestId: 7 }],
    ['turn/completed', { threadId: 't', turn: { id: 'turn', status: 'interrupted' } }],
    ['turn/started', { threadId: 't', turn: { id: 'next' } }],
  ])('clears obsolete requests on %s', (method, params) => {
    request()
    request(8, { threadId: 'other', isBlocking: true })
    notify(method, params)
    expect(server.listPendingServerRequests().map((row) => row.id)).toEqual([8])
    vi.advanceTimersByTime(120_000)
    expect(writes).not.toHaveBeenCalled()
  })

  it('clears timers and notifies connected clients when the process is disposed', () => {
    request()
    server.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(server.listPendingServerRequests()).toEqual([])
    expect(notifications).toHaveBeenCalledWith({ method: 'server/request/resolved', params: { id: 7 } })
  })

  it('never times out blocking questions, approvals, or MCP elicitation', () => {
    request(1, { isBlocking: true })
    request(2, {}, 'item/commandExecution/requestApproval')
    request(3, {}, 'mcpServer/elicitation/request')
    vi.advanceTimersByTime(300_000)
    expect(writes).not.toHaveBeenCalled()
    expect(server.listPendingServerRequests()).toHaveLength(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not confuse a server question with an outgoing RPC using the same id', () => {
    const resolve = vi.fn()
    server['pending'].set(7, { resolve, reject: vi.fn() })
    request()
    expect(resolve).not.toHaveBeenCalled()
    expect(server.listPendingServerRequests()).toHaveLength(1)
    server['handleLine'](JSON.stringify({ id: 7, result: { ok: true } }))
    expect(resolve).toHaveBeenCalledWith({ ok: true })
  })
})
