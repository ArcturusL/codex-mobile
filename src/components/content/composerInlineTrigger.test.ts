import { describe, expect, it } from 'vitest'
import { filterComposerSlashSuggestions, findComposerInlineTrigger } from './composerInlineTrigger'

describe('filterComposerSlashSuggestions', () => {
  it('puts title matches before description matches without reordering ties or duplicating results', () => {
    const docx = { label: '/docx', description: 'Create polished Word documents' }
    const mention = { label: '/mention', description: 'Mention a file' }
    const ponytail = { label: '/ponytail', description: 'Supports minimal solutions' }
    const poetry = { label: '/poetry', description: 'Write verses' }
    const report = { label: '/report', description: 'Prepare reports' }
    const items = [docx, mention, ponytail, poetry, report]
    expect(filterComposerSlashSuggestions(items, ' PO ')).toEqual([ponytail, poetry, docx, report])
    expect(filterComposerSlashSuggestions(items, '')).toEqual(items)
    expect(filterComposerSlashSuggestions(items, 'polished')).toEqual([docx])
    expect(filterComposerSlashSuggestions(items, 'missing')).toEqual([])
    expect(items).toEqual([docx, mention, ponytail, poetry, report])
  })
})

describe('findComposerInlineTrigger', () => {
  it('finds file mentions after whitespace and preserves path queries', () => {
    expect(findComposerInlineTrigger('check @src/components/Thr', 25)).toEqual({
      kind: 'file',
      start: 6,
      query: 'src/components/Thr',
    })
  })

  it('only treats the first-line leading token as a slash command', () => {
    expect(findComposerInlineTrigger('/ski', 4)).toEqual({ kind: 'slash', start: 0, query: 'ski' })
    expect(findComposerInlineTrigger('please /ski', 11)).toBeNull()
    expect(findComposerInlineTrigger('/skills now', 11)).toBeNull()
  })

  it('uses the active file mention inside slash command arguments', () => {
    expect(findComposerInlineTrigger('/review @src/App', 16)).toEqual({
      kind: 'file',
      start: 8,
      query: 'src/App',
    })
  })
})
