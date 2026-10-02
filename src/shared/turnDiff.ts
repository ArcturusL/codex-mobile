import type { UiFileChange, UiMessage } from '../types/codex'

// Git quotes non-ASCII path bytes using C-style octal escapes.
function diffPath(value: string): string {
  let path = value.split('\t')[0] ?? ''
  if (path.startsWith('"') && path.endsWith('"')) {
    const bytes: number[] = []
    const encoder = new TextEncoder()
    const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"' }
    for (const token of path.slice(1, -1).matchAll(/\\([0-7]{1,3}|.)|([^\\]+)/gu)) {
      if (token[1] && /^[0-7]+$/u.test(token[1])) bytes.push(parseInt(token[1], 8))
      else bytes.push(...encoder.encode(token[2] ?? escapes[token[1]] ?? token[1]))
    }
    path = new TextDecoder().decode(new Uint8Array(bytes))
  }
  return path === '/dev/null' ? '' : path.replace(/^[ab]\//u, '')
}

export function parseTurnDiff(diff: string): UiFileChange[] {
  const files: UiFileChange[] = []
  const blocks = diff.replace(/\r\n/gu, '\n').split(/(?=^diff --git )/mu)
  for (const block of blocks) {
    if (!block.startsWith('diff --git ')) continue
    const lines = block.split('\n')
    const hunkIndex = lines.findIndex((line) => line.startsWith('@@ '))
    const headers = hunkIndex < 0 ? lines : lines.slice(0, hunkIndex)
    const gitPaths = lines[0].match(/^diff --git ("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/u)
    let oldPath = diffPath(gitPaths?.[1] ?? '')
    let newPath = diffPath(gitPaths?.[2] ?? '')
    let operation: UiFileChange['operation'] = 'update'
    for (const line of headers) {
      if (line.startsWith('--- ')) oldPath = diffPath(line.slice(4))
      if (line.startsWith('+++ ')) newPath = diffPath(line.slice(4))
      if (line.startsWith('new file mode ')) operation = 'add'
      if (line.startsWith('deleted file mode ')) operation = 'delete'
    }
    if (!oldPath) operation = 'add'
    if (!newPath) operation = 'delete'
    const path = oldPath || newPath
    if (!path) continue
    const body = hunkIndex < 0 ? [] : lines.slice(hunkIndex)
    files.push({
      path, operation,
      movedToPath: operation === 'update' && oldPath !== newPath ? newPath : null,
      diff: block, diffFormat: 'unified',
      addedLineCount: body.filter((line) => line.startsWith('+')).length,
      removedLineCount: body.filter((line) => line.startsWith('-')).length,
    })
  }
  return files
}

export function turnDiffMessage(turnId: string, diff: string, turnIndex?: number): UiMessage {
  return {
    id: `turn-diff:${turnId}`, role: 'system', text: '', messageType: 'fileChange',
    fileChangeStatus: 'completed', fileChangeSource: 'turnDiff',
    fileChanges: parseTurnDiff(diff), turnId, turnIndex,
  }
}

export function turnDiffItem(turnId: string, diff: string): Record<string, unknown> {
  return {
    id: `turn-diff:${turnId}`, type: 'fileChange', status: 'completed', isTurnDiff: true,
    changes: parseTurnDiff(diff).map((change) => ({
      ...change, kind: { type: change.operation, move_path: change.movedToPath },
    })),
  }
}
