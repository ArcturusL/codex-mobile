import { turnDiffItem } from '../shared/turnDiff'

type Item = Record<string, unknown>

export function readSessionFileChanges(raw: string): Map<string, Item[]> {
  const turns = new Map<string, Map<string, Item>>()
  let turnId = ''
  for (const line of raw.split('\n')) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    const payload = row?.payload
    if (!payload) continue
    if (row.type === 'turn_context' || (row.type === 'event_msg' && payload.type === 'task_started')) {
      turnId = payload.turn_id || turnId
    }
    if (row.type !== 'event_msg' || !turnId) continue
    let item: Item | undefined
    if (payload.type === 'turn_diff' && typeof payload.unified_diff === 'string') {
      item = turnDiffItem(turnId, payload.unified_diff)
    } else if (payload.type === 'item_completed' && payload.item?.type === 'FileChange' && payload.item.status === 'completed') {
      const source = payload.item
      item = {
        id: source.id, type: 'fileChange', status: 'completed',
        changes: Object.entries(source.changes ?? {}).flatMap(([path, value]) => {
          const change = value as Item | null
          if (!change || !['add', 'delete', 'update'].includes(String(change.type))) return []
          return [{ path, kind: { type: change.type, move_path: change.move_path },
            diff: change.type === 'update' ? change.unified_diff ?? '' : change.content ?? '' }]
        }),
      }
    }
    if (!item || typeof item.id !== 'string') continue
    const items = turns.get(turnId) ?? new Map<string, Item>()
    items.set(item.id, item)
    turns.set(turnId, items)
  }
  return new Map([...turns].map(([id, items]) => [id, [...items.values()]]))
}

export function mergeSessionFileChanges(turns: unknown[], changes: Map<string, Item[]>): unknown[] {
  if (changes.size === 0) return turns
  return turns.map((turn) => {
    const record = turn as Item
    const recovered = changes.get(String(record.id))
    if (!recovered?.length) return turn
    const items = Array.isArray(record.items) ? record.items as Item[] : []
    const ids = new Set(items.map((item) => item.id))
    const missing = recovered.filter((item) => !ids.has(item.id))
    return missing.length ? { ...record, items: [...items, ...missing] } : turn
  })
}
