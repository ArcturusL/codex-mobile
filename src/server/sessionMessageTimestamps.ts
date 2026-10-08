import { toMessageTimestamp } from '../shared/messageTimestamp'

type Item = Record<string, unknown>

export function readSessionMessageTimestamps(raw: string): Map<string, string> {
  const timestamps = new Map<string, string>()
  for (const line of raw.split('\n')) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    const payload = row?.payload
    if (!payload) continue
    if (row.type === 'event_msg' && (payload.type === 'item_started' || payload.type === 'item_completed')) {
      const timestamp = toMessageTimestamp(payload.started_at_ms)
        ?? timestamps.get(payload.item?.id)
        ?? toMessageTimestamp(row.timestamp)
      if (typeof payload.item?.id === 'string' && timestamp) timestamps.set(payload.item.id, timestamp)
    } else if (row.type === 'response_item') {
      const timestamp = toMessageTimestamp(row.timestamp)
      // Native item events carry the actual start time; response records are a fallback.
      if (typeof payload.id === 'string' && timestamp && !timestamps.has(payload.id)) {
        timestamps.set(payload.id, timestamp)
      }
    }
  }
  return timestamps
}

export function mergeSessionMessageTimestamps(turns: unknown[], timestamps: Map<string, string>): unknown[] {
  if (!timestamps.size) return turns
  let anyChanged = false
  const merged = turns.map((turn) => {
    const record = turn as Item
    if (!Array.isArray(record?.items)) return turn
    let changed = false
    const items = (record.items as Item[]).map((item) => {
      const createdAtIso = timestamps.get(String(item?.id))
      if (!createdAtIso || item.createdAtIso === createdAtIso) return item
      changed = true
      anyChanged = true
      return { ...item, createdAtIso }
    })
    return changed ? { ...record, items } : turn
  })
  return anyChanged ? merged : turns
}
