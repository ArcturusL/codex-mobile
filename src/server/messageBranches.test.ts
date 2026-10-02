import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readMessageBranches, saveMessageBranch } from './messageBranches'

it('persists concurrent branch additions, rejects invalid links and preserves corrupt data', async () => {
  const home = await mkdtemp(join(tmpdir(), 'message-branches-'))
  try {
    expect(await readMessageBranches(home)).toEqual([])
    const branches = Array.from({ length: 8 }, (_, index) => ({ threadId: `branch-${index}`, sourceThreadId: 'original', turnIndex: 1 }))
    await Promise.all(branches.map((branch) => saveMessageBranch(home, branch)))
    expect(await readMessageBranches(home)).toEqual(branches)
    await saveMessageBranch(home, branches[0]!)
    expect(await readMessageBranches(home)).toHaveLength(8)
    await expect(saveMessageBranch(home, { threadId: 'original', sourceThreadId: 'branch-0', turnIndex: 1 })).rejects.toThrow('ancestry')
    await expect(saveMessageBranch(home, { threadId: 'bad', sourceThreadId: 'original', turnIndex: -1 })).rejects.toThrow('Invalid')
    await writeFile(join(home, 'message-branches.json'), '{broken')
    await expect(saveMessageBranch(home, branches[0]!)).rejects.toThrow()
    expect(await readFile(join(home, 'message-branches.json'), 'utf8')).toBe('{broken')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
