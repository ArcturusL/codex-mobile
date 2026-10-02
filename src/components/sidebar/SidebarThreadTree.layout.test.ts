import vue from '@vitejs/plugin-vue'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createSSRApp, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'

let server: ViteDevServer
let sidebar: Component
beforeAll(async () => {
  server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false }, logLevel: 'error' })
  sidebar = (await server.ssrLoadModule('/src/components/sidebar/SidebarThreadTree.vue')).default
}, 15_000)
afterAll(async () => { await server?.close() })

it('does not reserve project height for hidden projectless chat groups', async () => {
  const project = { projectName: 'Visible', threads: [] }
  const hidden = Array.from({ length: 19 }, (_, i) => ({
    projectName: `Chat ${i}`,
    threads: [{ id: `chat-${i}`, title: `Chat ${i}`, preview: '', cwd: `/tmp/Documents/Codex/2026-09-15/chat-${i}`, updatedAtIso: '2026-09-15T00:00:00Z' }],
  }))
  const html = await renderToString(createSSRApp(sidebar, {
    groups: [hidden[0], project, ...hidden.slice(1)], projectDisplayNameById: {}, projectGitRepoByName: {}, projectCwdByName: {},
    selectedThreadId: '', isLoading: false, isThreadListFullyLoaded: true, searchQuery: '', searchMatchedThreadIds: null,
  }))
  expect(html.match(/class="project-group"/g)).toHaveLength(1)
  // Before DOM measurement, no phantom gaps or final project padding should remain.
  expect(html).toMatch(/class="thread-tree-groups" style="height:0px;/)
})
