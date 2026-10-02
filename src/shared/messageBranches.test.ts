import { describe, expect, it } from 'vitest'
import { messageBranchControls, messageBranchSource } from './messageBranches'

const branches = [
  { sourceThreadId: 'a', threadId: 'b', turnIndex: 2 },
  { sourceThreadId: 'b', threadId: 'c', turnIndex: 5 },
  { sourceThreadId: 'a', threadId: 'd', turnIndex: 2 },
  { sourceThreadId: 'a', threadId: 'e', turnIndex: 0 },
]

describe('message version ancestry', () => {
  it('groups repeated edits at the same turn and keeps independent later forks', () => {
    expect(messageBranchSource(branches, 'c', 2)).toBe('a')
    expect(messageBranchSource(branches, 'c', 1)).toBe('a')
    expect(messageBranchSource(branches, 'c', 4)).toBe('b')
    expect(messageBranchSource(branches, 'c', 6)).toBe('c')
    expect(messageBranchControls(branches, 'c')).toEqual([
      { turnIndex: 0, threadIds: ['a', 'e'], selectedIndex: 0 },
      { turnIndex: 2, threadIds: ['a', 'b', 'd'], selectedIndex: 1 },
      { turnIndex: 5, threadIds: ['b', 'c'], selectedIndex: 1 },
    ])
    expect(messageBranchControls(branches, 'd')).toEqual([
      { turnIndex: 0, threadIds: ['a', 'e'], selectedIndex: 0 },
      { turnIndex: 2, threadIds: ['a', 'b', 'd'], selectedIndex: 2 },
    ])
    expect(messageBranchControls(branches, 'e')).toEqual([
      { turnIndex: 0, threadIds: ['a', 'e'], selectedIndex: 1 },
    ])
  })
})
