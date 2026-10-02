import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2 } from '../api/normalizers/v2'
import type { ThreadReadResponse } from '../api/appServerDtos'
import { toMessageTimestamp } from '../shared/messageTimestamp'
import { mergeSessionMessageTimestamps, readSessionMessageTimestamps } from './sessionMessageTimestamps'

describe('message timestamps', () => {
  it('recovers native item start times by ID through history normalization and pagination', () => {
    const started = '2026-09-22T01:02:03.000Z'
    const completed = '2026-09-22T01:02:09.000Z'
    const raw = [
      { timestamp: completed, type: 'response_item', payload: { id: 'answer', type: 'message', role: 'assistant' } },
      { timestamp: completed, type: 'event_msg', payload: { type: 'item_completed', started_at_ms: Date.parse(started), item: { id: 'answer', type: 'AgentMessage' } } },
      { timestamp: completed, type: 'response_item', payload: { id: 'answer', type: 'message', role: 'assistant' } },
      { timestamp: started, type: 'event_msg', payload: { type: 'item_completed', item: { id: 'user', type: 'UserMessage' } } },
      { timestamp: completed, type: 'response_item', payload: { id: 'old-answer', type: 'message' } },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n{incomplete\nnull\n'
    const timestamps = readSessionMessageTimestamps(raw)
    expect(timestamps.get('answer')).toBe(started)
    expect(timestamps.get('old-answer')).toBe(completed)
    const turns = [{ id: 'turn', status: 'completed', items: [
      { id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'Hello' }] },
      { id: 'answer', type: 'agentMessage', text: 'Hello back' },
      { id: 'unknown', type: 'agentMessage', text: 'No time recorded' },
    ] }]
    const merged = mergeSessionMessageTimestamps(turns, timestamps)
    const messages = normalizeThreadMessagesV2({ thread: { turns: merged } } as ThreadReadResponse, 20)
    expect(messages.map(({ id, createdAtIso, turnIndex }) => ({ id, createdAtIso, turnIndex }))).toEqual([
      { id: 'user', createdAtIso: started, turnIndex: 20 },
      { id: 'answer', createdAtIso: started, turnIndex: 20 },
      { id: 'unknown', createdAtIso: undefined, turnIndex: 20 },
    ])
    expect(turns[0].items[0]).not.toHaveProperty('createdAtIso')
    expect(mergeSessionMessageTimestamps(turns, new Map())).toBe(turns)
  })

  it('normalizes seconds, milliseconds and ISO offsets without fabricating missing/invalid times', () => {
    const iso = '2026-09-22T01:02:03.000Z'
    for (const value of [Date.parse(iso), Date.parse(iso) / 1000, '2026-09-22T09:02:03+08:00']) {
      expect(toMessageTimestamp(value)).toBe(iso)
    }
    for (const value of [undefined, null, '', 'invalid', NaN, Infinity, 1e20]) {
      expect(toMessageTimestamp(value)).toBeUndefined()
    }
  })
})
