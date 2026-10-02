import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2, readThreadInProgressFromResponse } from './v2'
import type { ThreadReadResponse } from '../appServerDtos'

function threadReadResponseWithContent(content: ThreadReadResponse['thread']['turns'][number]['items'][number][]): ThreadReadResponse {
  return {
    thread: {
      id: 'thread-1',
      preview: 'Use a skill',
      modelProvider: 'openai',
      createdAt: 1,
      updatedAt: 2,
      path: null,
      cwd: '/tmp/project',
      cliVersion: 'test',
      source: 'appServer',
      gitInfo: null,
      turns: [{
        id: 'turn-1',
        status: 'completed',
        error: null,
        items: content,
      }],
    },
  }
}

describe('normalizeThreadMessagesV2', () => {
  it('restores ordered reasoning and command history with an activity entry for each finished turn', () => {
    const response = threadReadResponseWithContent([])
    response.thread.turns = ['completed', 'failed', 'interrupted'].map((status, index) => ({
      id: `turn-${index}`,
      status: status as 'completed' | 'failed' | 'interrupted',
      error: null,
      items: [
        { id: `reasoning-${index}`, type: 'reasoning', summary: ['Inspect files', 'Check changes'], content: ['Content fallback'] },
        {
          id: `command-${index}`, type: 'commandExecution', command: 'pwd', cwd: '/tmp/project',
          processId: null, status: 'completed', commandActions: [], aggregatedOutput: '/tmp/project\n',
          exitCode: 0, durationMs: 12,
        },
        { id: `answer-${index}`, type: 'agentMessage', text: 'Done' },
      ],
    }))

    const messages = normalizeThreadMessagesV2(response, 10)

    expect(messages.map((message) => message.id)).toEqual([0, 1, 2].flatMap((index) => [
      `reasoning-${index}`, `command-${index}`, `turn-summary:turn-${index}`, `answer-${index}`,
    ]))
    expect(messages[0]).toMatchObject({
      text: 'Inspect files\n\nCheck changes', messageType: 'agentReasoning', turnId: 'turn-0', turnIndex: 10,
    })
    expect(messages[1]?.commandExecution).toMatchObject({
      command: 'pwd', cwd: '/tmp/project', status: 'completed', aggregatedOutput: '/tmp/project\n', exitCode: 0,
    })
    expect(messages.filter((message) => message.messageType === 'worked').map((message) => message.turnIndex))
      .toEqual([10, 11, 12])
  })

  it('uses available reasoning content when no summary exists and ignores empty items', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      { id: 'content-only', type: 'reasoning', summary: [], content: ['Available content'] },
      { id: 'empty', type: 'reasoning', summary: [], content: [] },
    ]))

    expect(messages.map((message) => [message.id, message.text])).toEqual([
      ['content-only', 'Available content'], ['turn-summary:turn-1', 'Worked'],
    ])
  })

  it('does not label an active turn as finished', () => {
    const response = threadReadResponseWithContent([
      { id: 'reasoning-active', type: 'reasoning', summary: ['Working'], content: [] },
    ])
    response.thread.turns[0].status = 'inProgress'

    expect(normalizeThreadMessagesV2(response).map((message) => message.messageType)).toEqual(['agentReasoning'])
  })

  it('preserves selected skill inputs on the rendered user message', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-1',
      content: [
        { type: 'text', text: 'Use the browser skill', text_elements: [] },
        { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      text: 'Use the browser skill',
      skills: [{ name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' }],
    })
  })

  it('renders skill-only user messages instead of dropping them as raw blocks', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-2',
      content: [
        { type: 'skill', name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-2',
      role: 'user',
      text: '',
      skills: [{ name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' }],
    })
    expect(messages[0].isUnhandled).toBeUndefined()
  })

  it('decodes escaped heartbeat instructions without exposing raw XML', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'automation-user-1',
      content: [{
        type: 'text',
        text: `<heartbeat>
<automation_id>automation-1</automation_id>
<current_time_iso>2026-05-09T00:00:00.000Z</current_time_iso>
<instructions>
Reply with &lt;/instructions&gt; and A &amp; B
</instructions>
</heartbeat>`,
        text_elements: [],
      }],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'automation-user-1',
      role: 'user',
      text: 'Reply with </instructions> and A & B',
      isAutomationRun: true,
      automationDisplayName: 'automation-1',
    })
  })

  it('applies a base turn index for paged thread slices', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-3',
      content: [{ type: 'text', text: 'Paged message', text_elements: [] }],
    }]), 12)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-3',
      turnId: 'turn-1',
      turnIndex: 12,
    })
  })

  it('renders failed turn errors as chat system messages', () => {
    const response = threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-4',
      content: [{ type: 'text', text: 'hi', text_elements: [] }],
    }])
    response.thread.turns[0].status = 'failed'
    response.thread.turns[0].error = {
      message: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header',
      codexErrorInfo: null,
      additionalDetails: null,
    }

    const messages = normalizeThreadMessagesV2(response)

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      id: 'turn-1-error',
      role: 'system',
      text: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header',
      messageType: 'turnError',
      turnId: 'turn-1',
      turnIndex: 0,
    })
  })

  it('uses turn index fallback ids for failed turns with blank ids', () => {
    const response = threadReadResponseWithContent([])
    response.thread.turns = [
      {
        id: '',
        status: 'failed',
        error: {
          message: 'first failed turn',
          codexErrorInfo: null,
          additionalDetails: null,
        },
        items: [],
      },
      {
        id: '   ',
        status: 'failed',
        error: {
          message: 'second failed turn',
          codexErrorInfo: null,
          additionalDetails: null,
        },
        items: [],
      },
    ]

    const messages = normalizeThreadMessagesV2(response, 8)

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'turn-8-error',
        text: 'first failed turn',
        turnId: undefined,
        turnIndex: 8,
      }),
      expect.objectContaining({
        id: 'turn-9-error',
        text: 'second failed turn',
        turnId: undefined,
        turnIndex: 9,
      }),
    ])
  })
})

describe('readThreadInProgressFromResponse', () => {
  it('treats active thread status objects as in progress', () => {
    const response = threadReadResponseWithContent([])
    ;(response.thread as unknown as { status: { type: string } }).status = { type: 'active' }

    expect(readThreadInProgressFromResponse(response)).toBe(true)
  })
})
