import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Execute the component's real handlers with controlled uploads and textarea state.
const source = readFileSync(new URL('./ThreadComposer.vue', import.meta.url), 'utf8')
const script = source.split('<script setup lang="ts">')[1]!.split('</script>')[0]!
const ast = ts.createSourceFile('composer.ts', script, ts.ScriptTarget.Latest, true)
const names = new Set(['onInputPaste', 'onInputKeydown', 'onInputKeyup', 'attachUploadedFile'])
const handlers = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name!.text))
  .map((node) => node.getText(ast)).join('\n')

function setup(uploadFile = vi.fn().mockResolvedValue(null)) {
  const input = { selectionStart: 1, selectionEnd: 3, setSelectionRange: vi.fn() }
  const state: any = {
    File, draft: { value: 'abcd' }, inputRef: { value: input }, document: { activeElement: input },
    isInteractionDisabled: { value: false }, pasteAsPlainText: false,
    PASTED_TEXT_FILE_THRESHOLD: 2000, attachmentSessionToken: 1,
    isAttachMenuOpen: { value: false }, isFileMentionOpen: { value: false }, isSlashMenuOpen: { value: false },
    props: {}, uploadFile,
    beginAttachmentWork: () => true, finishAttachmentWork: vi.fn(),
    beginAttachmentBatch: vi.fn(), recordAttachmentBatchResult: vi.fn(),
    addFileAttachment: vi.fn(), attachIncomingFiles: vi.fn(), closeFileMention: vi.fn(),
    createPastedTextFileName: () => 'pasted.txt', onInputChange: vi.fn(), nextTick: (fn: () => void) => Promise.resolve().then(fn),
  }
  runInNewContext(ts.transpile(handlers, { target: ts.ScriptTarget.ES2022 }), state)
  const paste = (text = 'x'.repeat(2000), items: unknown[] = []) => {
    const event = { clipboardData: { getData: () => text, items }, preventDefault: vi.fn() }
    state.onInputPaste(event)
    return event
  }
  return { state, paste, uploadFile }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('composer paste', () => {
  it.each([null, 'throw'])('restores full text at the selection after upload failure: %s', async (result) => {
    const { state, paste } = setup(result === 'throw' ? vi.fn().mockRejectedValue(new Error('network')) : undefined)
    expect(paste().preventDefault).toHaveBeenCalledOnce()
    await flush()
    expect(state.draft.value).toBe('a' + 'x'.repeat(2000) + 'd')
    expect(state.addFileAttachment).not.toHaveBeenCalled()
    expect(state.finishAttachmentWork).toHaveBeenCalledOnce()
  })
  it('keeps successful long text as one attachment', async () => {
    const { state, paste, uploadFile } = setup(vi.fn().mockResolvedValue('/tmp/pasted.txt'))
    paste()
    await flush()
    expect(state.draft.value).toBe('abcd')
    expect(uploadFile).toHaveBeenCalledOnce()
    expect(state.addFileAttachment).toHaveBeenCalledWith('/tmp/pasted.txt')
  })
  it.each([false, true])('lets native plain paste bypass uploads (meta=%s), then resets', (metaKey) => {
    const { state, paste, uploadFile } = setup()
    state.onInputKeydown({ key: 'V', ctrlKey: !metaKey, metaKey, shiftKey: true })
    expect(paste().preventDefault).not.toHaveBeenCalled()
    expect(uploadFile).not.toHaveBeenCalled()
    expect(state.attachIncomingFiles).not.toHaveBeenCalled()
    state.onInputKeyup({ key: 'V' })
    paste()
    expect(uploadFile).toHaveBeenCalledOnce()
  })
  it('preserves intervening edits and ignores failures from another attachment session', async () => {
    let finish!: (value: null) => void
    const { state, paste } = setup(vi.fn(() => new Promise((resolve) => { finish = resolve })))
    paste()
    state.draft.value = 'new text'
    finish(null)
    await flush()
    expect(state.draft.value).toBe('new text' + 'x'.repeat(2000))
    paste()
    state.attachmentSessionToken++
    state.draft.value = 'other thread'
    finish(null)
    await flush()
    expect(state.draft.value).toBe('other thread')
  })
  it('leaves short plain text to native paste', () => {
    const { paste, uploadFile } = setup()
    expect(paste('short').preventDefault).not.toHaveBeenCalled()
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
