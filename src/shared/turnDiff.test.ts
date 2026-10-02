import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2 } from '../api/normalizers/v2'
import { parseTurnDiff, turnDiffItem } from './turnDiff'
import { mergeSessionFileChanges, readSessionFileChanges } from '../server/sessionFileChanges'
import type { ThreadReadResponse } from '../api/appServerDtos'

export const sampleDiff = 'diff --git a/notes.md b/notes.md\n--- a/notes.md\n+++ b/notes.md\n@@ -4,2 +4,2 @@\n-before\n+after\n context\n'

describe('per-turn file differences', () => {
  it('parses updates, additions, deletions, renames and quoted Unicode paths', () => {
    const files = parseTurnDiff(sampleDiff
      + 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+hello\n+++ literal\n'
      + 'diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n--- literal\n'
      + 'diff --git "a/\\346\\226\\207 old.md" "b/\\346\\226\\207 new.md"\nsimilarity index 100%\nrename from old\nrename to new\n')
    expect(files.map(({ path, operation, movedToPath, addedLineCount, removedLineCount }) =>
      [path, operation, movedToPath, addedLineCount, removedLineCount])).toEqual([
      ['notes.md', 'update', null, 1, 1], ['new.txt', 'add', null, 2, 0],
      ['old.txt', 'delete', null, 0, 1], ['文 old.md', 'update', '文 new.md', 0, 0],
    ])
    const items = [turnDiffItem('turn', files.map((file) => file.diff).join(''))]
    const messages = normalizeThreadMessagesV2({ thread: { turns: [{ id: 'turn', status: 'completed', items }] } } as ThreadReadResponse, 20)
    expect(messages[0]).toMatchObject({ fileChangeSource: 'turnDiff', turnIndex: 20, fileChanges: files })
    expect(parseTurnDiff('')).toEqual([])
  })

  it('recovers completed modern tool events by turn and keeps only the latest aggregate', () => {
    const row = (payload: unknown) => JSON.stringify({ type: 'event_msg', payload })
    const raw = [
      'broken JSON', row({ type: 'task_started', turn_id: 'one' }),
      row({ type: 'item_completed', item: { id: 'edit', type: 'FileChange', status: 'completed', changes: {
        '/tmp/notes.md': { type: 'update', unified_diff: '@@ -1 +1 @@\n-a\n+b\n', move_path: null },
      } } }),
      row({ type: 'item_completed', item: { id: 'bad', type: 'FileChange', status: 'failed', changes: {} } }),
      row({ type: 'turn_diff', unified_diff: sampleDiff }),
      row({ type: 'turn_diff', unified_diff: '' }),
      row({ type: 'task_started', turn_id: 'two' }),
      row({ type: 'item_completed', item: { id: 'add', type: 'FileChange', status: 'completed', changes: {
        '/tmp/new.txt': { type: 'add', content: 'hello\n' },
      } } }),
    ].join('\n')
    const recovered = readSessionFileChanges(raw)
    expect(recovered.get('one')?.map((item) => item.id)).toEqual(['edit', 'turn-diff:one'])
    expect(recovered.get('one')?.[1].changes).toEqual([])
    const existing = [{ id: 'one', items: [recovered.get('one')![0]] }, { id: 'two', items: [] }]
    const merged = mergeSessionFileChanges(existing, recovered)
    expect(mergeSessionFileChanges(merged, recovered)).toEqual(merged)
    const messages = normalizeThreadMessagesV2({ thread: { turns: merged } } as ThreadReadResponse)
    expect(messages.map((message) => message.id)).toEqual(['edit', 'turn-diff:one', 'add'])
    expect(messages[2]).toMatchObject({ turnId: 'two', fileChanges: [{ operation: 'add', diff: 'hello\n' }] })
  })
})
