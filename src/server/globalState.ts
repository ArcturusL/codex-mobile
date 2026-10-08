import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'

export async function readGlobalState(path: string): Promise<Record<string, unknown>> {
  try {
    const state: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('Invalid Codex global state')
    }
    return state as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

// ponytail: serialize this process's small state writes; shared multi-process
// writers would need a cross-process lock.
let mutation: Promise<void> = Promise.resolve()

export function flushGlobalState(): Promise<void> { return mutation }

export function updateGlobalState(
  path: string,
  update: (state: Record<string, unknown>) => void,
): Promise<void> {
  const run = mutation.then(async () => {
    const state = await readGlobalState(path)
    update(state)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, path)
    } finally {
      await rm(temporaryPath, { force: true })
    }
  })
  mutation = run.catch(() => {})
  return run
}
