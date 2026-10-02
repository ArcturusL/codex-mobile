export type ComposerInlineTrigger = {
  kind: 'file' | 'slash'
  start: number
  query: string
}

export function filterComposerSlashSuggestions<T extends { label: string; description: string }>(items: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase()
  const titleMatches: T[] = []
  const descriptionMatches: T[] = []
  for (const item of items) {
    if (item.label.slice(1).toLowerCase().startsWith(normalizedQuery)) {
      titleMatches.push(item)
    } else if (item.description.toLowerCase().includes(normalizedQuery)) {
      descriptionMatches.push(item)
    }
  }
  return [...titleMatches, ...descriptionMatches]
}

export function findComposerInlineTrigger(text: string, cursor: number): ComposerInlineTrigger | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const beforeCursor = text.slice(0, safeCursor)
  const fileMatch = beforeCursor.match(/(^|\s)(@[^\s@]*)$/)
  const slashMatch = beforeCursor.match(/^\/([^\s/]*)$/)

  const fileToken = fileMatch?.[2]
  if (fileToken) {
    return {
      kind: 'file',
      start: safeCursor - fileToken.length,
      query: fileToken.slice(1),
    }
  }
  if (slashMatch) {
    return {
      kind: 'slash',
      start: 0,
      query: slashMatch[1] ?? '',
    }
  }
  return null
}
