import { turnDiffMessage } from '../shared/turnDiff'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWorkspaceRootsProjectOrderState,
  collectWorkspaceRootPathsForProjectRemoval,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  removeThreadFromGroups,
  isThreadUnreadByLastRead,
  useDesktopState,
} from './useDesktopState'
import type { UiMessage, UiProjectGroup } from '../types/codex'
import type { WorkspaceRootsState } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  archiveThread: vi.fn(),
  forkThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAvailableCollaborationModes: vi.fn(),
  getAvailableModelIds: vi.fn(),
  getCurrentModelConfig: vi.fn(),
  getPendingServerRequests: vi.fn(),
  getSkillsList: vi.fn(),
  getThreadDetail: vi.fn(),
  getThreadSummary: vi.fn(),
  getOlderThreadMessages: vi.fn(),
  getThreadGroupsPage: vi.fn(),
  getThreadQueueState: vi.fn(),
  getMessageBranches: vi.fn(),
  persistMessageBranch: vi.fn(),
  getThreadTitleCache: vi.fn(),
  getWorkspaceRootsState: vi.fn(),
  generateThreadTitle: vi.fn(),
  interruptThreadTurn: vi.fn(),
  persistThreadTitle: vi.fn(),
  renameThread: vi.fn(),
  replyToServerRequest: vi.fn(),
  resumeThread: vi.fn(),
  revertThreadFileChanges: vi.fn(),
  rollbackThread: vi.fn(),
  setCodexSpeedMode: vi.fn(),
  setThreadQueueState: vi.fn(),
  setWorkspaceRootsState: vi.fn(),
  startThread: vi.fn(),
  startThreadTurn: vi.fn(),
  subscribeCodexNotifications: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({
  ...gatewayMocks,
  getBackgroundThreadListLimit: vi.fn(() => 100),
  pickCodexRateLimitSnapshot: vi.fn(() => null),
}))

function thread(id: string, cwd: string, options: { hasWorktree?: boolean } = {}) {
  return {
    id,
    title: id,
    projectName: cwd ? cwd.split('/').at(-1) || cwd : 'Projectless',
    cwd,
    hasWorktree: options.hasWorktree ?? false,
    createdAtIso: '2026-04-28T00:00:00.000Z',
    updatedAtIso: '2026-04-28T00:00:00.000Z',
    preview: '',
    unread: false,
    inProgress: false,
  }
}

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.getThreadQueueState.mockResolvedValue({})
  gatewayMocks.getMessageBranches.mockResolvedValue([])
  gatewayMocks.persistMessageBranch.mockImplementation(async (branch) => [branch])
  gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: {} })
  gatewayMocks.getWorkspaceRootsState.mockRejectedValue(new Error('no workspace roots state'))
  gatewayMocks.generateThreadTitle.mockReset().mockResolvedValue('')
  gatewayMocks.renameThread.mockReset().mockResolvedValue(undefined)
  gatewayMocks.persistThreadTitle.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('composer Fast mode', () => {
  it('saves the selection once while pending and restores it if saving fails', async () => {
    installTestWindow()
    let finishSave!: () => void
    gatewayMocks.setCodexSpeedMode.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve }))
    const state = useDesktopState()

    const saving = state.updateSelectedSpeedMode('fast')
    expect(state.selectedSpeedMode.value).toBe('fast')
    expect(state.isUpdatingSpeedMode.value).toBe(true)
    await state.updateSelectedSpeedMode('standard')
    expect(gatewayMocks.setCodexSpeedMode).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.setCodexSpeedMode).toHaveBeenCalledWith('fast')
    finishSave()
    await saving
    expect(state.isUpdatingSpeedMode.value).toBe(false)

    gatewayMocks.setCodexSpeedMode.mockRejectedValueOnce(new Error('config is read-only'))
    await state.updateSelectedSpeedMode('standard')
    expect(state.selectedSpeedMode.value).toBe('fast')
    expect(state.error.value).toBe('config is read-only')
    expect(state.isUpdatingSpeedMode.value).toBe(false)
  })
})

describe('filterGroupsByWorkspaceRoots', () => {
  it('keeps projectless chats visible when workspace roots are configured', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'Projectless',
        threads: [thread('projectless-chat', '')],
      },
      {
        projectName: 'allowed-project',
        threads: [thread('allowed-chat', '/tmp/allowed-project')],
      },
      {
        projectName: 'other-project',
        threads: [thread('other-chat', '/tmp/other-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/allowed-project'],
      labels: {},
      active: ['/tmp/allowed-project'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'Projectless',
      'allowed-project',
    ])
  })

  it('keeps workspace roots with the same folder name as separate projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'api',
        threads: [
          thread('first-api-chat', '/tmp/first/api'),
          thread('second-api-chat', '/tmp/second/api'),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {},
      active: ['/tmp/first/api', '/tmp/second/api'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      '/tmp/first/api',
      '/tmp/second/api',
    ])
  })

  it('uses Codex project-order when workspace roots are hydrated', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('alpha-chat', '/tmp/alpha')],
      },
      {
        projectName: 'beta',
        threads: [thread('beta-chat', '/tmp/beta')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/alpha', '/tmp/beta'],
      labels: {},
      active: ['/tmp/alpha'],
      projectOrder: ['/tmp/beta', '/tmp/alpha'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'beta',
      'alpha',
    ])
  })

  it('keeps empty duplicate workspace roots visible in Codex project order', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'TestChat',
        threads: [thread('testchat-chat', '/Users/igor/temp/TestChat')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      labels: {},
      active: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      projectOrder: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['/Users/igor/Documents/New project 2/TestChat', 0],
      ['/Users/igor/temp/TestChat', 1],
    ])
  })

  it('keeps remote projects from Codex project order visible as empty project rows', () => {
    const groups: UiProjectGroup[] = []
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['remote-project-id', 0],
      ['local-project', 0],
    ])
  })

  it('keeps managed worktree threads under the matching workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['codex-web-local', ['main-chat', 'worktree-chat']],
    ])
  })

  it('keeps unregistered managed worktrees under the main root when another managed worktree root is registered', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('registered-worktree-chat', '/Users/igor/.codex/worktrees/a77f/codex-web-local', { hasWorktree: true }),
          thread('unregistered-worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: [
        '/Users/igor/Git-projects/codex-web-local',
        '/Users/igor/.codex/worktrees/a77f/codex-web-local',
      ],
      labels: {
        '/Users/igor/.codex/worktrees/a77f/codex-web-local': 'codex-web-local2',
      },
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat', 'unregistered-worktree-chat']],
      ['/Users/igor/.codex/worktrees/a77f/codex-web-local', ['registered-worktree-chat']],
    ])
  })

  it('does not group unrelated git worktrees under a same-leaf workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('other-git-worktree-chat', '/tmp/other/.git/worktrees/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
    ])
  })
})

describe('removeThreadFromGroups', () => {
  it('removes an archived thread and drops the now-empty project group', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
      {
        projectName: 'archived-project',
        threads: [thread('archive-me', '/tmp/archived-project')],
      },
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
      {
        projectName: 'empty-workspace-root',
        threads: [],
      },
    ]

    expect(removeThreadFromGroups(groups, 'archive-me').map((group) => [
      group.projectName,
      group.threads.map((row) => row.id),
    ])).toEqual([
      ['alpha', ['keep-alpha']],
      ['beta', ['keep-beta']],
      ['empty-workspace-root', []],
    ])
  })

  it('preserves referential identity when the thread is absent', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
    ]

    expect(removeThreadFromGroups(groups, 'missing-thread')).toBe(groups)
  })
})

describe('workspace roots project persistence helpers', () => {
  it('collects duplicate-path project roots by full path when removing a project', () => {
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {
        '/tmp/first/api': 'First API',
        '/tmp/second/api': 'Second API',
      },
      active: ['/tmp/first/api'],
      projectOrder: ['/tmp/first/api', '/tmp/second/api'],
    }

    expect([...collectWorkspaceRootPathsForProjectRemoval(rootsState, '/tmp/first/api')]).toEqual([
      '/tmp/first/api',
    ])
  })

  it('preserves remote project ids in explicit project order when persisting workspace roots', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'local-project',
        threads: [thread('local-chat', '/tmp/local-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(buildWorkspaceRootsProjectOrderState(rootsState, ['remote-project-id', 'local-project'], groups)).toEqual({
      order: ['/tmp/local-project'],
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
    })
  })
})

describe('thread unread state helpers', () => {
  const cutoffIso = '2026-05-01T12:00:00.000Z'

  it('uses the initialization cutoff when a thread has no read state', () => {
    expect(isThreadUnreadByLastRead('2026-05-01T11:59:59.000Z', undefined, cutoffIso)).toBe(false)
    expect(isThreadUnreadByLastRead('2026-05-01T12:00:01.000Z', undefined, cutoffIso)).toBe(true)
  })

  it('uses per-thread read state instead of the global cutoff after a thread is read', () => {
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:30:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(false)
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:50:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(true)
  })
})

describe('collaboration mode selection', () => {
  it('can prime an empty selected thread without clearing persisted selection', () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })

    const state = useDesktopState()

    expect(state.selectedThreadId.value).toBe('thread-a')

    state.primeSelectedThread('', { persist: false })

    expect(state.selectedThreadId.value).toBe('')
    expect(window.localStorage.getItem('codex-web-local.selected-thread-id.v1')).toBe('thread-a')
  })

  it('does not carry plan mode from new chats into existing threads', () => {
    installTestWindow({
      'codex-web-local.collaboration-mode.v1': 'plan',
    })

    const state = useDesktopState()

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')

    expect(state.selectedCollaborationMode.value).toBe('plan')
    expect(window.localStorage.getItem('codex-web-local.collaboration-mode-by-context.v1')).toBe(null)

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')
    state.primeSelectedThread('thread-b')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('plan')
  })
})

describe('Codex CLI availability', () => {
  it('surfaces a chat runtime error when the app-server bridge cannot find Codex CLI', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockRejectedValue(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })

    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')
  })

  it('clears a previous Codex CLI missing banner when a later refresh fails for another reason', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage
      .mockRejectedValueOnce(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))
      .mockRejectedValueOnce(new Error('Connection lost'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.error.value).toBe('Connection lost')
    expect(state.codexCliMissingError.value).toBe('')
  })

})

describe('startup request deduplication', () => {
  it('reloads cached thread titles on forced thread refresh', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getThreadTitleCache
      .mockResolvedValueOnce({ titles: {} })
      .mockResolvedValueOnce({ titles: { 'thread-1': 'Imported title' } })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('thread-1')

    await state.refreshAll({ includeSelectedThreadMessages: false, forceThreadRefresh: true })

    expect(gatewayMocks.getThreadTitleCache).toHaveBeenCalledTimes(2)
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('Imported title')
  })

  it('reuses a just-loaded thread list during startup refresh bursts', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })

    try {
      const state = useDesktopState()
      await state.refreshAll({ includeSelectedThreadMessages: false })
      await state.refreshAll({ includeSelectedThreadMessages: false })

      expect(gatewayMocks.getThreadGroupsPage).toHaveBeenCalledTimes(1)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('reuses a just-loaded skills list for the same selected cwd', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([
      {
        name: 'example',
        description: 'Example skill',
        path: '/tmp/project/.agents/skills/example/SKILL.md',
        scope: 'project',
        enabled: true,
      },
    ])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])

    try {
      const state = useDesktopState()
      state.primeSelectedThread('thread-1')
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

      expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(1)
      expect(gatewayMocks.getSkillsList).toHaveBeenCalledWith(['/tmp/project'])
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('reuses a just-loaded empty skills list for the same selected cwd', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])

    try {
      const state = useDesktopState()
      state.primeSelectedThread('thread-1')
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

      expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(1)
      expect(state.installedSkills.value).toEqual([])
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('bypasses recent thread-list reuse for event-driven thread refreshes', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })

    try {
      const state = useDesktopState()
      await state.refreshAll({ includeSelectedThreadMessages: false })
      const callsBeforeNotification = gatewayMocks.getThreadGroupsPage.mock.calls.length
      state.startPolling()
      expect(notificationHandler).toBeDefined()
      notificationHandler!({
        method: 'thread/name/updated',
        params: {
          threadId: 'thread-1',
          threadName: 'Updated title',
        },
      })
      await Promise.resolve()
      await Promise.resolve()

      expect(gatewayMocks.getThreadGroupsPage.mock.calls.length).toBeGreaterThan(callsBeforeNotification)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('automatic conversation titles', () => {
  it('titles a background reply only after success, deduplicates events, and preserves a manual rename', async () => {
    installTestWindow()
    let notify: (event: { method: string; params: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => { notify = handler; return vi.fn() })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('title-test', '/tmp/project')] }], nextCursor: null,
    })
    let finish: (title: string) => void = () => {}
    gatewayMocks.generateThreadTitle.mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    gatewayMocks.renameThread.mockResolvedValue(undefined)
    gatewayMocks.persistThreadTitle.mockResolvedValue(undefined)
    gatewayMocks.setThreadQueueState.mockResolvedValue(undefined)
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    notify({ method: 'item/completed', params: { threadId: 'title-test', item: { id: 'answer', type: 'agentMessage', text: 'Computed caches values.' } } })
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()
    notify({ method: 'turn/completed', params: { threadId: 'title-test', turn: { id: 'failed', status: 'failed' } } })
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()
    const completed = { method: 'turn/completed', params: { threadId: 'title-test', turn: { id: 'ok', status: 'completed' } } }
    notify(completed)
    notify(completed)
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledWith(expect.stringContaining('Computed caches values.'), '/tmp/project', expect.objectContaining({ threadId: 'title-test' }))
    finish('计算属性缓存')
    await vi.waitFor(() => expect(gatewayMocks.persistThreadTitle).toHaveBeenCalledWith('title-test', '计算属性缓存'))
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('计算属性缓存')
    notify({ method: 'thread/name/updated', params: { threadId: 'title-test', threadName: '我的标题' } })
    notify(completed)
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledTimes(1)
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('我的标题')
    state.stopPolling()
  })
})

describe('conversation activity history', () => {
  it('keeps completed activities until history takes over and refreshes a just-loaded turn once', async () => {
    installTestWindow()
    const threadId = 'activity-thread'
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread(threadId, '/tmp/project')] }], nextCursor: null,
    })
    gatewayMocks.resumeThread.mockResolvedValue(null)
    const earlierMessages: UiMessage[] = [
      { id: 'old-reasoning', role: 'assistant', text: 'Earlier summary', messageType: 'agentReasoning', turnId: 'old-turn', turnIndex: 0 },
      { id: 'turn-summary:old-turn', role: 'system', text: 'Worked', messageType: 'worked', turnId: 'old-turn', turnIndex: 0 },
      { id: 'user', role: 'user', text: 'Check this', messageType: 'userMessage', turnId: 'turn-1', turnIndex: 1 },
    ]
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: earlierMessages, inProgress: true, activeTurnId: 'turn-1',
      turnIndexByTurnId: { 'old-turn': 0, 'turn-1': 1 }, hasMoreOlder: false,
    })
    const state = useDesktopState()
    state.primeSelectedThread(threadId)
    await state.loadMessages(threadId)
    state.startPolling()
    const emit = (method: string, params: Record<string, unknown>) => notificationHandler({
      method, params: { threadId, turnId: 'turn-1', ...params },
    })

    // Long turns can contain many reasoning items without any readable content.
    for (let index = 0; index < 100; index += 1) {
      const id = `empty-reasoning-${index}`
      emit('item/started', { item: { id, type: 'reasoning', summary: [], content: [] } })
      emit('item/reasoning/summaryPartAdded', { itemId: id, summaryIndex: 0 })
      emit('item/reasoning/summaryTextDelta', { itemId: id, delta: ' \n' })
      emit('item/completed', { item: { id, type: 'reasoning', summary: [' \n'], content: [] } })
    }
    expect(state.messages.value).toEqual(earlierMessages)
    expect(state.selectedLiveOverlay.value).toMatchObject({ activityLabel: 'Thinking', reasoningText: '' })
    // A turn can also finish without an item/completed notification.
    emit('item/started', { item: { id: 'empty-unfinished', type: 'reasoning' } })
    emit('item/started', { item: { id: 'reasoning-1', type: 'reasoning' } })
    emit('item/reasoning/summaryTextDelta', { itemId: 'reasoning-1', delta: 'Inspect ' })
    emit('item/reasoning/summaryTextDelta', { itemId: 'reasoning-1', delta: 'files' })
    // Replayed starts must not erase already streamed text.
    emit('item/started', { item: { id: 'reasoning-1', type: 'reasoning' } })
    expect(state.messages.value.find((message) => message.id === 'reasoning-1')?.text).toBe('Inspect files')
    emit('item/completed', { item: { id: 'reasoning-1', type: 'reasoning', summary: ['Inspect files'], content: ['Unused content'] } })
    emit('item/started', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd', cwd: '/tmp/project' } })
    emit('item/commandExecution/outputDelta', { itemId: 'command-1', delta: '/tmp/project\n' })
    emit('item/completed', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd', cwd: '/tmp/project', status: 'completed', aggregatedOutput: null, exitCode: 0 } })
    emit('item/reasoning/textDelta', { itemId: 'reasoning-2', delta: 'Check ' })
    emit('item/reasoning/textDelta', { itemId: 'reasoning-2', delta: 'output' })
    emit('item/completed', { item: { id: 'reasoning-2', type: 'reasoning', summary: [], content: [] } })
    emit('item/completed', { item: { id: 'answer', type: 'agentMessage', text: 'Done' } })
    emit('turn/completed', { turn: { id: 'turn-1', status: 'completed' }, durationMs: 1234 })
    notificationHandler({
      method: 'item/completed',
      params: { threadId, item: { id: 'command-1', type: 'commandExecution', command: 'pwd', cwd: '/tmp/project', status: 'completed', aggregatedOutput: null, exitCode: 0 } },
    })

    const activityIds = ['reasoning-1', 'command-1', 'reasoning-2']
    expect(state.messages.value.some((message) => message.id.startsWith('empty-'))).toBe(false)
    expect(state.messages.value.filter((message) => activityIds.includes(message.id)).map((message) => message.id))
      .toEqual(activityIds)
    expect(state.messages.value.find((message) => message.id === 'reasoning-2')).toMatchObject({
      text: 'Check output', messageType: 'agentReasoning', turnId: 'turn-1', turnIndex: 1,
    })
    expect(state.messages.value.find((message) => message.id === 'command-1')?.commandExecution).toMatchObject({
      status: 'completed', aggregatedOutput: '/tmp/project\n', exitCode: 0,
    })
    expect(state.messages.value.find((message) => message.id === 'command-1')).toMatchObject({ turnId: 'turn-1', turnIndex: 1 })
    expect(state.messages.value.filter((message) => message.messageType === 'worked').map((message) => message.turnId))
      .toEqual(['old-turn', 'turn-1'])
    expect(state.selectedLiveOverlay.value).toBeNull()

    // A completed read can lag behind item notifications. Keep the observed activities.
    const answer: UiMessage = { id: 'answer', role: 'assistant', text: 'Done', messageType: 'agentMessage', turnId: 'turn-1', turnIndex: 1 }
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        ...earlierMessages,
        { id: 'reasoning-1', role: 'assistant', text: 'Inspect', messageType: 'agentReasoning', turnId: 'turn-1', turnIndex: 1 },
        {
          id: 'command-1', role: 'system', text: 'pwd', messageType: 'commandExecution', turnId: 'turn-1', turnIndex: 1,
          commandExecution: { command: 'pwd', cwd: '/tmp/project', status: 'inProgress', aggregatedOutput: '', exitCode: null },
        },
        answer,
      ], inProgress: false, activeTurnId: '',
      turnIndexByTurnId: { 'old-turn': 0, 'turn-1': 1 }, hasMoreOlder: false,
    })
    const eventSync = vi.mocked(window.setTimeout).mock.calls.find((call) => call[1] === 220)?.[0]
    expect(typeof eventSync).toBe('function')
    if (typeof eventSync === 'function') eventSync()
    await vi.waitFor(() => expect(gatewayMocks.getThreadDetail).toHaveBeenCalledTimes(2))
    expect(state.messages.value.filter((message) => activityIds.includes(message.id))).toHaveLength(3)
    expect(state.messages.value.find((message) => message.id === 'reasoning-1')?.text).toBe('Inspect files')
    expect(state.messages.value.find((message) => message.id === 'command-1')?.commandExecution).toMatchObject({
      status: 'completed', aggregatedOutput: '/tmp/project\n', exitCode: 0,
    })

    const persistedMessages = [
      ...earlierMessages,
      ...state.messages.value.filter((message) => activityIds.includes(message.id)),
      { id: 'turn-summary:turn-1', role: 'system', text: 'Worked', messageType: 'worked', turnId: 'turn-1', turnIndex: 1 },
      answer,
    ]
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: persistedMessages, inProgress: false, activeTurnId: '',
      turnIndexByTurnId: { 'old-turn': 0, 'turn-1': 1 }, hasMoreOlder: false,
    })
    await state.loadMessages(threadId, { force: true, silent: true })
    expect(state.messages.value.filter((message) => activityIds.includes(message.id))).toHaveLength(3)
    expect(state.messages.value.filter((message) => message.messageType === 'worked')).toHaveLength(2)
    expect(state.messages.value.findIndex((message) => message.id === 'turn-summary:turn-1'))
      .toBeLessThan(state.messages.value.findIndex((message) => message.id === 'answer'))
    emit('turn/started', { turnId: 'turn-2', turn: { id: 'turn-2', status: 'inProgress' } })
    expect(state.messages.value.findIndex((message) => message.id === 'turn-summary:turn-1'))
      .toBeLessThan(state.messages.value.findIndex((message) => message.id === 'answer'))

    const reloaded = useDesktopState()
    reloaded.primeSelectedThread(threadId)
    await reloaded.loadMessages(threadId)
    expect(reloaded.messages.value.filter((message) => activityIds.includes(message.id))).toHaveLength(3)
    expect(reloaded.messages.value.filter((message) => message.messageType === 'worked')).toHaveLength(2)
  })

  it('refreshes after an in-flight read when a turn event requires fresh history', async () => {
    installTestWindow()
    gatewayMocks.resumeThread.mockResolvedValue(null)
    let resolveRead: (value: unknown) => void = () => {}
    const detail = {
      messages: [], inProgress: true, activeTurnId: 'turn-1',
      turnIndexByTurnId: { 'turn-1': 0 }, hasMoreOlder: false,
    }
    gatewayMocks.getThreadDetail
      .mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve }))
      .mockResolvedValueOnce({
        ...detail, inProgress: false, activeTurnId: '',
        messages: [{ id: 'reasoning', role: 'assistant', text: 'Saved summary', messageType: 'agentReasoning', turnId: 'turn-1' }],
      })
    const state = useDesktopState()
    state.primeSelectedThread('pending-history-thread')
    const firstRead = state.loadMessages('pending-history-thread')
    await Promise.resolve()
    const eventRead = state.loadMessages('pending-history-thread', { force: true, silent: true })
    resolveRead(detail)
    await Promise.all([firstRead, eventRead])

    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledTimes(2)
    expect(state.messages.value).toEqual([expect.objectContaining({ id: 'reasoning', text: 'Saved summary' })])
    expect(state.selectedLiveOverlay.value).toBeNull()
  })
})

describe('live error overlay', () => {
  it('shows the default thinking overlay while a selected thread is in progress without activity events', async () => {
    installTestWindow()
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'create todo list app',
          messageType: 'userMessage',
        },
      ],
      inProgress: true,
      activeTurnId: 'turn-1',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-thinking')
    await state.loadMessages('thread-thinking')

    expect(state.selectedLiveOverlay.value).toMatchObject({
      activityLabel: 'Thinking',
      reasoningText: '',
      errorText: '',
    })
  })

  it('keeps a new live error visible when an older persisted turn error exists', async () => {
    installTestWindow()
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'old-error',
          role: 'system',
          text: 'old persisted failure',
          messageType: 'turnError',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-with-errors')
    await state.loadMessages('thread-with-errors')
    state.startPolling()

    notificationHandler?.({
      method: 'turn/completed',
      params: {
        threadId: 'thread-with-errors',
        turnId: 'new-turn',
        turn: {
          id: 'new-turn',
          status: 'failed',
          error: { message: 'new live failure' },
        },
      },
    })

    expect(state.selectedLiveOverlay.value?.errorText).toBe('new live failure')
  })

  it('suppresses a live error only after that same error has persisted', async () => {
    installTestWindow()
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'persisted-error',
          role: 'system',
          text: 'same failure',
          messageType: 'turnError',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-with-persisted-error')
    await state.loadMessages('thread-with-persisted-error')
    state.startPolling()

    notificationHandler?.({
      method: 'turn/completed',
      params: {
        threadId: 'thread-with-persisted-error',
        turnId: 'same-turn',
        turn: {
          id: 'same-turn',
          status: 'failed',
          error: { message: 'same failure' },
        },
      },
    })

    expect(state.selectedLiveOverlay.value).toBe(null)
  })
})

describe('provider model selection', () => {
  it('ignores global selected-model localStorage when OpenCode Zen is the active provider', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'gpt-5.5',
      }),
      'codex-web-local.selected-model-id.v1': 'gpt-5.5',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getAvailableModelIds).toHaveBeenCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('').trim()).toBe('big-pickle')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::opencode-zen': 'big-pickle',
    })
    expect(window.localStorage.getItem('codex-web-local.selected-model-id.v1')).toBe(null)
  })

  it('restores a valid provider-scoped OpenCode Zen selected model from localStorage', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::opencode-zen': 'ring-2.6-1t-free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('ring-2.6-1t-free')
    expect(state.readModelIdForThread('').trim()).toBe('ring-2.6-1t-free')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::opencode-zen': 'ring-2.6-1t-free',
    })
  })

  it('stores the new-thread Codex model in a provider-scoped slot', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::openrouter-free': 'openrouter/free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue([
      'gpt-5.5',
      'gpt-5.4-mini',
    ])

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('gpt-5.5')
    expect(state.readModelIdForThread('').trim()).toBe('gpt-5.5')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::openrouter-free': 'openrouter/free',
      '__new-thread-provider__::codex': 'gpt-5.5',
    })
  })

  it('drops stale non-Codex selected models from the Codex model list', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::codex': 'big-pickle',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue([
      'gpt-5.5',
      'gpt-5.4-mini',
    ])

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.availableModelIds.value).toEqual([
      'gpt-5.5',
      'gpt-5.4-mini',
    ])
    expect(state.availableModelIds.value).not.toContain('big-pickle')
    expect(state.selectedModelId.value).toBe('gpt-5.5')
    expect(state.readModelIdForThread('').trim()).toBe('gpt-5.5')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::codex': 'gpt-5.5',
    })
  })

  it('keeps an existing OpenCode Zen thread locked to Zen models after Codex auth becomes active', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('legacy-zen-thread', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockImplementation(async (options?: { providerId?: string }) => {
      if (options?.providerId === 'opencode-zen') {
        return ['big-pickle', 'ring-2.6-1t-free']
      }
      return ['gpt-5.5', 'gpt-5.4-mini']
    })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'opencode_zen',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    state.primeSelectedThread('legacy-zen-thread')
    await state.loadMessages('legacy-zen-thread')
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getAvailableModelIds).toHaveBeenLastCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('legacy-zen-thread')).toBe('big-pickle')
    expect(state.readModelIdForThread('')).toBe('gpt-5.4-mini')
  })

  it('loads provider models for a selected provider-backed thread during scheduled refreshes', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('legacy-zen-thread', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockImplementation(async (options?: { providerId?: string }) => {
      if (options?.providerId === 'opencode-zen') {
        return ['big-pickle', 'ring-2.6-1t-free']
      }
      return ['gpt-5.5', 'gpt-5.4-mini']
    })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'opencode_zen',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    state.primeSelectedThread('legacy-zen-thread')
    await state.loadMessages('legacy-zen-thread')
    await state.refreshAll({ includeSelectedThreadMessages: false })
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))

    expect(gatewayMocks.getAvailableModelIds).toHaveBeenLastCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual(['big-pickle', 'ring-2.6-1t-free'])
    expect(state.selectedModelId.value).toBe('big-pickle')
  })

  it('captures the active provider when creating a new thread', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'gpt-5.4-mini'])
    gatewayMocks.startThread.mockResolvedValue({
      threadId: 'codex-thread',
      model: 'gpt-5.5',
      modelProvider: 'openai',
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')
    gatewayMocks.getThreadDetail.mockResolvedValue({
      model: 'gpt-5.5',
      modelProvider: 'openai',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Hi.',
          messageType: 'agentMessage',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    await state.sendMessageToNewThread('hi', '/tmp/project')

    expect(gatewayMocks.startThread).toHaveBeenCalledWith('/tmp/project', 'gpt-5.5')
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledWith(
      'codex-thread',
      'hi',
      [],
      'gpt-5.5',
      'medium',
      undefined,
      [],
      'default',
    )
    expect(state.readModelIdForThread('codex-thread')).toBe('gpt-5.5')
    expect(state.messages.value.some((message) => (
      message.role === 'user' &&
      message.text === 'hi' &&
      message.messageType === 'userMessage.optimistic'
    ))).toBe(true)

    const modelConfigCallsBeforeLoad = gatewayMocks.getCurrentModelConfig.mock.calls.length
    const availableModelCallsBeforeLoad = gatewayMocks.getAvailableModelIds.mock.calls.length
    await state.loadMessages('codex-thread')
    expect(gatewayMocks.getCurrentModelConfig).toHaveBeenCalledTimes(modelConfigCallsBeforeLoad)
    expect(gatewayMocks.getAvailableModelIds).toHaveBeenCalledTimes(availableModelCallsBeforeLoad)
    expect(state.messages.value.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:hi',
      'assistant:Hi.',
    ])
  })

  it('refreshes a loaded optimistic thread when completion events arrive', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'gpt-5.4-mini'])
    gatewayMocks.startThread.mockResolvedValue({
      threadId: 'mini-thread',
      model: 'gpt-5.4-mini',
      modelProvider: 'openai',
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')
    gatewayMocks.getThreadDetail.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'openai',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'hi',
          messageType: 'userMessage',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Hi.',
          messageType: 'agentMessage',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    await state.sendMessageToNewThread('hi', '/tmp/project')
    state.startPolling()
    expect(notificationHandler).toBeDefined()
    notificationHandler!({
      method: 'turn/completed',
      params: {
        threadId: 'mini-thread',
        turn: { id: 'turn-1', status: 'completed' },
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledWith('mini-thread')
    expect(state.messages.value.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:hi',
      'system:Worked for <1s',
      'assistant:Hi.',
    ])
  })

  it('surfaces selected thread load failures and still refreshes models', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'gpt-5.4-mini'])
    gatewayMocks.resumeThread.mockRejectedValue(new Error('thread not found'))

    const state = useDesktopState()
    state.primeSelectedThread('missing-thread')
    await state.refreshAll({
      includeSelectedThreadMessages: true,
      awaitAncillaryRefreshes: true,
    })

    expect(state.selectedLiveOverlay.value?.errorText).toContain('thread not found')
    expect(state.availableModelIds.value).toEqual(['gpt-5.5', 'gpt-5.4-mini'])
    expect(state.selectedModelId.value).toBe('gpt-5.5')

    await state.ensureThreadMessagesLoaded('missing-thread', { silent: true })
    await state.loadMessages('missing-thread')
    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(1)
  })
})

describe('automatic thread titles', () => {
  async function startConversation(text = 'Build a todo app', imageUrls: string[] = []) {
    installTestWindow()
    let notify: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notify = handler
      return vi.fn()
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5', providerId: 'openai', reasoningEffort: 'medium', speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'gpt-5.4-mini'])
    gatewayMocks.startThread.mockResolvedValue({
      threadId: 'title-thread', model: 'gpt-5.4-mini', modelProvider: 'openai',
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockImplementation(async (threadId: string) => ({
      model: threadId === 'title-thread' ? 'gpt-5.4-mini' : 'big-pickle',
      modelProvider: threadId === 'title-thread' ? 'openai' : 'opencode-zen',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    }))

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.startPolling()
    await state.sendMessageToNewThread(text, '/tmp/project', imageUrls)
    const complete = (status = 'completed') => notify({
      method: 'turn/completed',
      params: { threadId: 'title-thread', turn: { id: 'turn-1', status } },
    })
    return { state, notify, complete }
  }

  it('waits for a successful reply, then renames and persists a title using both sides of the conversation', async () => {
    gatewayMocks.generateThreadTitle.mockResolvedValue('Todo app implementation')
    const { state, notify, complete } = await startConversation()
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()

    notify({
      method: 'item/completed',
      params: {
        threadId: 'title-thread',
        item: { id: 'assistant-1', type: 'agentMessage', text: 'Created the todo app.' },
      },
    })
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()
    complete()

    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledWith(
      'User: Build a todo app\nAssistant: Created the todo app.',
      '/tmp/project',
      { threadId: 'title-thread', model: 'gpt-5.4-mini', modelProvider: 'codex' },
    )
    await vi.waitFor(() => {
      expect(gatewayMocks.persistThreadTitle).toHaveBeenCalledWith('title-thread', 'Todo app implementation')
    })
    expect(gatewayMocks.renameThread).toHaveBeenCalledWith('title-thread', 'Todo app implementation')
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('Todo app implementation')
  })

  it('uses the completed conversation model and provider after another thread is selected', async () => {
    const { state, complete } = await startConversation()
    state.primeSelectedThread('other-thread')
    await state.loadMessages('other-thread')
    expect(state.selectedModelId.value).toBe('big-pickle')

    complete()

    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledWith(
      expect.stringContaining('Build a todo app'),
      '/tmp/project',
      { threadId: 'title-thread', model: 'gpt-5.4-mini', modelProvider: 'codex' },
    )
  })

  it('uses the final background reply to title an image-only conversation after switching threads', async () => {
    const { state, notify, complete } = await startConversation('', ['https://example.test/cat.png'])
    state.primeSelectedThread('other-thread')
    await state.loadMessages('other-thread')
    expect(state.selectedModelId.value).toBe('big-pickle')
    notify({
      method: 'item/completed',
      params: {
        threadId: 'title-thread',
        item: { id: 'assistant-1', type: 'agentMessage', text: 'The photo shows an orange cat.' },
      },
    })
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()

    complete()

    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledExactlyOnceWith(
      'User: \nAssistant: The photo shows an orange cat.',
      '/tmp/project',
      { threadId: 'title-thread', model: 'gpt-5.4-mini', modelProvider: 'codex' },
    )
  })

  it('deduplicates completion events while generating and after the title is saved', async () => {
    let resolveTitle!: (title: string) => void
    gatewayMocks.generateThreadTitle.mockReturnValue(new Promise<string>((resolve) => { resolveTitle = resolve }))
    const { complete } = await startConversation()

    complete()
    complete()
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledTimes(1)
    resolveTitle('Todo app')
    await vi.waitFor(() => expect(gatewayMocks.persistThreadTitle).toHaveBeenCalledTimes(1))
    complete()
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.renameThread).toHaveBeenCalledTimes(1)
  })

  it.each(['failed', 'interrupted'])('does not generate a title for a %s turn', async (status) => {
    const { complete } = await startConversation()
    complete(status)
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()
    expect(gatewayMocks.renameThread).not.toHaveBeenCalled()
  })

  it.each(['empty result', 'request failure'])('retries on a later completion after an %s', async (failure) => {
    if (failure === 'empty result') gatewayMocks.generateThreadTitle.mockResolvedValueOnce('')
    else gatewayMocks.generateThreadTitle.mockRejectedValueOnce(new Error('model unavailable'))
    gatewayMocks.generateThreadTitle.mockResolvedValue('Todo app')
    const { complete } = await startConversation()

    complete()
    await Promise.resolve()
    expect(gatewayMocks.renameThread).not.toHaveBeenCalled()
    complete()
    await vi.waitFor(() => expect(gatewayMocks.persistThreadTitle).toHaveBeenCalledWith('title-thread', 'Todo app'))
    expect(gatewayMocks.generateThreadTitle).toHaveBeenCalledTimes(2)
  })

  it('preserves an existing cached title', async () => {
    gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: { 'title-thread': 'My project' } })
    const { state, complete } = await startConversation()
    complete()
    expect(gatewayMocks.generateThreadTitle).not.toHaveBeenCalled()
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('My project')
  })

  it.each(['completed', 'pending'])('preserves a %s manual rename while title generation is in flight', async (renameStatus) => {
    let resolveTitle!: (title: string) => void
    let resolveRename!: () => void
    gatewayMocks.generateThreadTitle.mockReturnValue(new Promise<string>((resolve) => { resolveTitle = resolve }))
    if (renameStatus === 'pending') {
      gatewayMocks.renameThread.mockReturnValue(new Promise<void>((resolve) => { resolveRename = resolve }))
    }
    const { state, complete } = await startConversation()
    complete()
    const manualRename = state.renameThreadById('title-thread', 'My chosen title')
    if (renameStatus === 'completed') await manualRename

    resolveTitle('Generated title')
    await Promise.resolve()
    expect(gatewayMocks.renameThread).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.renameThread).toHaveBeenCalledWith('title-thread', 'My chosen title')
    if (renameStatus === 'pending') {
      expect(gatewayMocks.persistThreadTitle).not.toHaveBeenCalled()
      resolveRename()
      await manualRename
    }
    expect(gatewayMocks.persistThreadTitle).toHaveBeenCalledWith('title-thread', 'My chosen title')
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('My chosen title')
  })
})

describe('findAdjacentThreadId', () => {
  it('selects the next thread after the archived thread', () => {
    const threads = [
      thread('first-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
      thread('next-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('next-thread')
  })

  it('falls back to the previous thread when the last thread is archived', () => {
    const threads = [
      thread('previous-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('previous-thread')
  })

  it('returns no fallback when there is no adjacent thread', () => {
    expect(findAdjacentThreadId([thread('selected-thread', '/tmp/project')], 'selected-thread')).toBe('')
  })
})


describe('composer permissions', () => {
  it('isolates thread choices and restores them after reload without extra RPCs', async () => {
    installTestWindow()
    const state = useDesktopState()
    state.primeSelectedThread('permission-a')
    state.setSelectedPermissionMode('auto-review')
    state.primeSelectedThread('permission-b')
    expect(state.selectedPermissionMode.value).toBeUndefined()
    state.setSelectedPermissionMode('read-only')
    state.setSelectedPermissionMode('invalid')
    await nextTick()
    const reloaded = useDesktopState()
    reloaded.primeSelectedThread('permission-a')
    expect(reloaded.selectedPermissionMode.value).toBe('auto-review')
    reloaded.primeSelectedThread('permission-b')
    expect(reloaded.selectedPermissionMode.value).toBe('read-only')
    expect(gatewayMocks.startThreadTurn).not.toHaveBeenCalled()
  })

  it('carries new-thread permissions into its first turn and persisted queue', async () => {
    installTestWindow()
    gatewayMocks.startThread.mockResolvedValue({ threadId: 'permissions-new', model: 'gpt-5.5', modelProvider: 'openai' })
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise(() => {}))
    gatewayMocks.setThreadQueueState.mockResolvedValue(undefined)
    const state = useDesktopState()
    state.setSelectedPermissionMode('read-only')
    await state.sendMessageToNewThread('inspect project', '/tmp/project')
    expect(gatewayMocks.startThreadTurn.mock.calls.at(-1)?.[8]).toBe('read-only')
    expect(state.selectedPermissionMode.value).toBe('read-only')
    await state.sendMessageToSelectedThread('next inspection', [], [], 'queue')
    const saved = gatewayMocks.setThreadQueueState.mock.calls.at(-1)?.[0]
    expect(saved['permissions-new'][0].permissionMode).toBe('read-only')
  })
})


describe('remembered composer choices', () => {
  it('restores manual choices after reload and metadata refresh, and inherits them in new chats', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({ model: 'gpt-5.5', providerId: 'codex', reasoningEffort: 'medium', speedMode: 'standard' })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'gpt-5.4-mini'])
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.primeSelectedThread('remember-a')
    state.setSelectedModelIdForThread('remember-a', 'gpt-5.4-mini')
    state.setSelectedReasoningEffort('high')
    state.setSelectedPermissionMode('read-only')
    // No nextTick: an immediate reload must not lose a picker selection.
    const reloaded = useDesktopState()
    expect(reloaded.selectedReasoningEffort.value).toBe('high')
    expect(reloaded.selectedPermissionMode.value).toBe('read-only')
    expect(reloaded.selectedModelId.value).toBe('gpt-5.4-mini')
    reloaded.primeSelectedThread('')
    await reloaded.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    expect(reloaded.selectedReasoningEffort.value).toBe('high')
    expect(reloaded.selectedPermissionMode.value).toBe('read-only')
    expect(reloaded.selectedModelId.value).toBe('gpt-5.4-mini')
    reloaded.setSelectedReasoningEffort('')
    const defaultEffort = useDesktopState()
    await defaultEffort.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    expect(defaultEffort.selectedReasoningEffort.value).toBe('')
    expect(gatewayMocks.startThreadTurn).not.toHaveBeenCalled()
  })

  it('retains an unsent model selection when the server resumes the old model', async () => {
    installTestWindow()
    const state = useDesktopState()
    state.setSelectedModelIdForThread('remember-a', 'gpt-5.4-mini')
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.5', modelProvider: 'codex', messages: [], inProgress: false, turnIndexByTurnId: {} })
    const reloaded = useDesktopState()
    reloaded.primeSelectedThread('remember-a')
    await reloaded.loadMessages('remember-a')
    expect(reloaded.selectedModelId.value).toBe('gpt-5.4-mini')
  })
})


describe('turn diff notifications', () => {
  it('replaces snapshots and retains each turn across stale history and new turns', async () => {
    installTestWindow()
    let notify: (event: { method: string; params: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => { notify = handler; return vi.fn() })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    const detail = { messages: [] as UiMessage[], inProgress: true, activeTurnId: 'one', turnIndexByTurnId: { one: 0 }, hasMoreOlder: false }
    gatewayMocks.getThreadDetail.mockResolvedValue(detail)
    const state = useDesktopState()
    state.primeSelectedThread('diff-thread')
    await state.loadMessages('diff-thread')
    state.startPolling()
    const diff = 'diff --git a/notes.md b/notes.md\n--- a/notes.md\n+++ b/notes.md\n@@ -1 +1 @@\n-a\n+b\n'
    const emit = (value: string) => notify({ method: 'turn/diff/updated', params: { threadId: 'diff-thread', turnId: 'one', diff: value } })
    emit(diff)
    emit(diff.replace('+b', '+c'))
    expect(state.messages.value.filter((m) => m.fileChangeSource === 'turnDiff')).toHaveLength(1)
    expect(state.messages.value[0].fileChanges?.[0].diff).toContain('+c')
    // A stale server snapshot must not overwrite a newer notification or duplicate it.
    detail.messages = [turnDiffMessage('one', diff, 0)]
    await state.loadMessages('diff-thread', { force: true })
    expect(state.messages.value.filter((m) => m.fileChangeSource === 'turnDiff')).toHaveLength(1)
    expect(state.messages.value[0].fileChanges?.[0].diff).toContain('+c')
    notify({ method: 'turn/started', params: { threadId: 'diff-thread', turn: { id: 'two', status: 'inProgress' } } })
    expect(state.messages.value.find((m) => m.turnId === 'one')?.fileChanges?.[0].diff).toContain('+c')
    emit('')
    expect(state.messages.value.find((m) => m.turnId === 'one')?.fileChanges).toEqual([])
    detail.messages = [turnDiffMessage('one', '', 0)]
    await state.loadMessages('diff-thread', { force: true })
    expect(state.messages.value.filter((m) => m.fileChangeSource === 'turnDiff')).toHaveLength(1)
    state.stopPolling()
  })
})


describe('edit message branches', () => {
  const original: UiMessage[] = [0, 1, 2].flatMap((turnIndex) => [
    { id: `u${turnIndex}`, role: 'user' as const, text: `question ${turnIndex}`, turnId: `t${turnIndex}`, turnIndex },
    { id: `a${turnIndex}`, role: 'assistant' as const, text: `answer ${turnIndex}`, turnId: `t${turnIndex}`, turnIndex },
  ])
  async function setup(inProgress = false) {
    installTestWindow()
    gatewayMocks.resumeThread.mockResolvedValue({ messages: original, inProgress, model: 'gpt-5.5', modelProvider: 'openai', turnIndexByTurnId: { t0: 0, t1: 1, t2: 2 } })
    gatewayMocks.forkThread.mockReset().mockResolvedValue({ threadId: 'edited', cwd: '/tmp/project', model: 'gpt-5.5', messages: original.slice(0, 2), turnCount: 1 })
    gatewayMocks.rollbackThread.mockReset()
    gatewayMocks.getThreadSummary.mockResolvedValue(thread('original', '/tmp/project'))
    gatewayMocks.startThread.mockReset().mockResolvedValue({ threadId: 'edited', model: 'gpt-5.5', modelProvider: 'openai' })
    gatewayMocks.archiveThread.mockReset().mockResolvedValue(undefined)
    const state = useDesktopState()
    state.primeSelectedThread('original')
    await state.loadMessages('original')
    return state
  }

  it('forks before the selected turn, preserves the original, and sends only to the branch', async () => {
    const state = await setup()
    expect(await state.editSelectedMessage('t1')).toBe('edited')
    state.primeSelectedThread('edited')
    expect(gatewayMocks.forkThread).toHaveBeenCalledExactlyOnceWith('original', { lastTurnId: 't0' })
    expect(gatewayMocks.rollbackThread).not.toHaveBeenCalled()
    expect(gatewayMocks.revertThreadFileChanges).not.toHaveBeenCalled()
    expect(state.messages.value.map((message) => message.text)).toEqual(['question 0', 'answer 0'])
    expect(state.selectedMessageBranches.value).toEqual([{ turnIndex: 1, threadIds: ['original', 'edited'], selectedIndex: 1 }])
    state.primeSelectedThread('original')
    expect(state.messages.value).toEqual(original)
    state.primeSelectedThread('edited')
    gatewayMocks.startThreadTurn.mockResolvedValue('new-turn')
    await state.sendMessageToSelectedThread('edited question')
    expect(gatewayMocks.startThreadTurn.mock.calls[0]?.[0]).toBe('edited')
  })

  it('blocks sends and repeated clicks until fork finishes; failure preserves the source', async () => {
    const state = await setup()
    let fail!: (error: Error) => void
    gatewayMocks.forkThread.mockImplementation(() => new Promise((_, reject) => { fail = reject }))
    const editing = state.editSelectedMessage('t1')
    await vi.waitFor(() => expect(gatewayMocks.forkThread).toHaveBeenCalled())
    await state.sendMessageToSelectedThread('must not append')
    expect(gatewayMocks.startThreadTurn).not.toHaveBeenCalled()
    expect(await state.editSelectedMessage('t1')).toBe('')
    expect(gatewayMocks.forkThread).toHaveBeenCalledTimes(1)
    fail(new Error('fork unavailable'))
    expect(await editing).toBe('')
    expect(state.selectedThreadId.value).toBe('original')
    expect(state.messages.value).toEqual(original)
    expect(gatewayMocks.persistMessageBranch).not.toHaveBeenCalled()
    expect(gatewayMocks.archiveThread).not.toHaveBeenCalled()
    expect(state.error.value).toBe('fork unavailable')
  })

  it('handles editing the first message and refuses edits during an active turn', async () => {
    const active = await setup(true)
    expect(await active.editSelectedMessage('t0')).toBe('')
    expect(gatewayMocks.forkThread).not.toHaveBeenCalled()
    const state = await setup()
    expect(await state.editSelectedMessage('t0')).toBe('edited')
    state.primeSelectedThread('edited')
    expect(gatewayMocks.rollbackThread).not.toHaveBeenCalled()
    expect(gatewayMocks.startThread).toHaveBeenCalledWith('/tmp/project', 'gpt-5.5', 'codex')
    expect(state.messages.value).toEqual([])
  })

  it('rejects a fork that ignores the turn boundary and fails closed on storage errors', async () => {
    const state = await setup()
    gatewayMocks.forkThread.mockResolvedValueOnce({ threadId: 'edited', cwd: '/tmp/project', model: 'gpt-5.5', messages: original, turnCount: 3 })
    expect(await state.editSelectedMessage('t1')).toBe('')
    expect(state.error.value).toBe('Codex did not fork at the selected message')
    expect(gatewayMocks.persistMessageBranch).not.toHaveBeenCalled()
    expect(gatewayMocks.archiveThread).toHaveBeenCalledWith('edited')
    gatewayMocks.persistMessageBranch.mockRejectedValueOnce(new Error('branch storage unavailable'))
    expect(await state.editSelectedMessage('t1')).toBe('')
    expect(state.selectedThreadId.value).toBe('original')
    expect(state.messages.value).toEqual(original)
    expect(state.error.value).toBe('branch storage unavailable')
    expect(gatewayMocks.startThreadTurn).not.toHaveBeenCalled()
    expect(gatewayMocks.rollbackThread).not.toHaveBeenCalled()
  })

  it('loads one preceding turn when editing at a history page boundary', async () => {
    const state = await setup()
    gatewayMocks.getThreadDetail.mockResolvedValue({ messages: original.slice(2), inProgress: false, model: 'gpt-5.5', modelProvider: 'openai', turnIndexByTurnId: { t1: 1, t2: 2 } })
    await state.loadMessages('original', { force: true })
    gatewayMocks.getOlderThreadMessages.mockResolvedValue({ messages: [], turnIndexByTurnId: { t0: 0 } })
    expect(await state.editSelectedMessage('t1')).toBe('edited')
    expect(gatewayMocks.getOlderThreadMessages).toHaveBeenCalledWith('original', 't1', 1)
    expect(gatewayMocks.forkThread).toHaveBeenCalledWith('original', { lastTurnId: 't0' })
  })

  it('does not navigate away from another thread opened during editing', async () => {
    const state = await setup()
    let finish!: (fork: unknown) => void
    gatewayMocks.forkThread.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const editing = state.editSelectedMessage('t1')
    await vi.waitFor(() => expect(gatewayMocks.forkThread).toHaveBeenCalled())
    state.primeSelectedThread('another-thread')
    finish({ threadId: 'edited', cwd: '/tmp/project', model: 'gpt-5.5', messages: original.slice(0, 2), turnCount: 1 })
    await editing
    expect(state.selectedThreadId.value).toBe('another-thread')
  })
})
