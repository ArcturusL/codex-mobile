import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readGlobalState, updateGlobalState } from './globalState'

it('preserves projects across concurrent state writes and exposes only complete JSON to readers', async () => {
  const home = await mkdtemp(join(tmpdir(), 'global-state-'))
  const path = join(home, '.codex-global-state.json')
  try {
    await updateGlobalState(path, (state) => {
      state['electron-saved-workspace-roots'] = ['/projects/first']
    })
    let finished = false
    const writes = Promise.all(Array.from({ length: 30 }, (_, index) => updateGlobalState(path, (state) => {
      if (index === 0) state['electron-saved-workspace-roots'] = ['/projects/first', '/projects/new']
      state[`setting-${index}`] = 'value'.repeat(1000)
    }))).finally(() => { finished = true })
    const reads = (async () => {
      while (!finished) {
        const snapshot = JSON.parse(await readFile(path, 'utf8'))
        expect(snapshot['electron-saved-workspace-roots']).toContain('/projects/first')
      }
    })()
    await Promise.all([writes, reads])
    const state = await readGlobalState(path)
    expect(state['electron-saved-workspace-roots']).toEqual(['/projects/first', '/projects/new'])
    expect(Object.keys(state)).toHaveLength(31)
    expect(await readdir(home)).toEqual(['.codex-global-state.json'])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('does not replace unreadable state with an empty document and recovers after a failed write', async () => {
  const home = await mkdtemp(join(tmpdir(), 'global-state-'))
  const path = join(home, '.codex-global-state.json')
  try {
    await writeFile(path, '{broken')
    await expect(readGlobalState(path)).rejects.toThrow()
    await expect(updateGlobalState(path, (state) => { state.title = 'new' })).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('{broken')
    await writeFile(path, JSON.stringify({ projects: ['/projects/first'] }))
    await updateGlobalState(path, (state) => { state.title = 'new' })
    expect(await readGlobalState(path)).toEqual({ projects: ['/projects/first'], title: 'new' })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
