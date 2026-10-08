import type { UiMessage } from '../types/codex'

const STORAGE_KEY = 'codex-web-local.pending-user-messages.v1'

export function readPendingUserMessages(): Record<string, UiMessage[]> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).flatMap(([threadId, value]) => {
      if (!Array.isArray(value)) return []
      const messages = value.filter((m): m is UiMessage => m?.role === 'user'
        && m.messageType === 'userMessage.optimistic' && typeof m.id === 'string'
        && typeof m.text === 'string'
        && (!m.deliveryBaselineIds || (Array.isArray(m.deliveryBaselineIds) && m.deliveryBaselineIds.every((id: unknown) => typeof id === 'string')))
        && (!m.images || (Array.isArray(m.images) && m.images.every((s: unknown) => typeof s === 'string')))
        && (!m.skills || (Array.isArray(m.skills) && m.skills.every((s: any) => typeof s?.name === 'string' && typeof s.path === 'string')))
        && (!m.fileAttachments || (Array.isArray(m.fileAttachments) && m.fileAttachments.every((f: any) => typeof f?.label === 'string' && typeof f.path === 'string' && typeof f.fsPath === 'string'))))
      return messages.length ? [[threadId, messages]] : []
    }))
  } catch { return {} }
}

export function restorePendingUserMessages(): Record<string, UiMessage[]> {
  return Object.fromEntries(Object.entries(readPendingUserMessages()).map(([id, messages]) => [id,
    messages.map(message => ({ ...message, deliveryState: message.deliveryState === 'sent' ? 'sent' : 'failed' })),
  ]))
}

// Save only unconfirmed messages, synchronously before issuing the request.
// Read-modify-write retains other threads' pending messages from this browser.
export function savePendingUserMessages(threadId: string, messages: UiMessage[]): void {
  const stored = readPendingUserMessages()
  if (messages.length) stored[threadId] = messages
  else delete stored[threadId]
  try {
    if (Object.keys(stored).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    throw new Error('Could not save the message locally. Your draft has been kept; copy it before leaving this page.')
  }
}
