import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MessageBranch } from '../shared/messageBranches'

export function isMessageBranch(value: unknown): value is MessageBranch {
  if (!value || typeof value !== 'object') return false
  const branch = value as MessageBranch
  return typeof branch.threadId === 'string' && /^[\w-]{1,128}$/.test(branch.threadId)
    && typeof branch.sourceThreadId === 'string' && /^[\w-]{1,128}$/.test(branch.sourceThreadId)
    && branch.threadId !== branch.sourceThreadId
    && Number.isSafeInteger(branch.turnIndex) && branch.turnIndex >= 0
}

export async function readMessageBranches(home: string): Promise<MessageBranch[]> {
  try {
    const value = JSON.parse(await readFile(join(home, 'message-branches.json'), 'utf8'))
    if (!Array.isArray(value) || !value.every(isMessageBranch)) throw new Error('Invalid message branch history')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

// ponytail: one WebUI process owns this store; use a file lock if multi-process serving is added.
let writeQueue = Promise.resolve()
export function saveMessageBranch(home: string, branch: MessageBranch): Promise<MessageBranch[]> {
  const saving = writeQueue.then(async () => {
    if (!isMessageBranch(branch)) throw new Error('Invalid message branch')
    const branches = await readMessageBranches(home)
    const existing = branches.find((entry) => entry.threadId === branch.threadId)
    if (existing) {
      if (existing.sourceThreadId !== branch.sourceThreadId || existing.turnIndex !== branch.turnIndex) throw new Error('Message branch already exists')
      return branches
    }
    // Each child must be new, so the persisted graph cannot acquire a cycle.
    if (branches.some((entry) => entry.sourceThreadId === branch.threadId)) throw new Error('Invalid branch ancestry')
    branches.push(branch)
    await mkdir(home, { recursive: true })
    const path = join(home, 'message-branches.json')
    await writeFile(`${path}.tmp`, JSON.stringify(branches), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
    return branches
  })
  writeQueue = saving.then(() => undefined, () => undefined)
  return saving
}
