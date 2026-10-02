export type MessageBranch = { threadId: string; sourceThreadId: string; turnIndex: number }
export type MessageBranchControl = { turnIndex: number; threadIds: string[]; selectedIndex: number }

// Edits at or before an existing fork belong to that fork's original history.
export function messageBranchSource(branches: MessageBranch[], threadId: string, turnIndex: number): string {
  const parents = new Map(branches.map((branch) => [branch.threadId, branch]))
  const visited = new Set<string>()
  while (!visited.has(threadId)) {
    visited.add(threadId)
    const parent = parents.get(threadId)
    if (!parent || parent.turnIndex < turnIndex) break
    threadId = parent.sourceThreadId
  }
  return threadId
}

export function messageBranchControls(branches: MessageBranch[], threadId: string): MessageBranchControl[] {
  const parents = new Map(branches.map((branch) => [branch.threadId, branch]))
  const groups = new Map<string, Map<number, string[]>>()
  for (const branch of branches) {
    let turns = groups.get(branch.sourceThreadId)
    if (!turns) groups.set(branch.sourceThreadId, turns = new Map())
    const ids = turns.get(branch.turnIndex) ?? [branch.sourceThreadId]
    ids.push(branch.threadId)
    turns.set(branch.turnIndex, ids)
  }
  const controls: MessageBranchControl[] = []
  const visited = new Set<string>()
  let before = Infinity
  let child: MessageBranch | undefined
  while (!visited.has(threadId)) {
    visited.add(threadId)
    for (const [turnIndex, threadIds] of groups.get(threadId) ?? []) {
      if (turnIndex < before || (turnIndex === before && child)) {
        controls.push({ turnIndex, threadIds, selectedIndex: turnIndex === before && child ? threadIds.indexOf(child.threadId) : 0 })
      }
    }
    child = parents.get(threadId)
    if (!child) break
    before = child.turnIndex
    threadId = child.sourceThreadId
  }
  return controls.sort((a, b) => a.turnIndex - b.turnIndex)
}
