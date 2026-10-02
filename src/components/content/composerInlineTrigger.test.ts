import { describe, expect, it } from 'vitest'
import { findComposerInlineTrigger } from './composerInlineTrigger'

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
