### Sidebar sessions survive symlinked workspace roots

#### Feature/Change Name
Workspace roots and thread-list cwd values are canonicalized through local `realpath` before the sidebar filters thread projects and before workspace-root state is written, so sessions remain visible whether they were recorded through a symlink path or its target.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A workspace root registered through a symlink path, for example `/workspace-link/projects/demo`
3. At least one session recorded with the canonical cwd, for example `/storage/projects/demo`
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the app and wait for the sidebar thread list to load.
2. Confirm a session recorded under the canonical cwd appears in the sidebar.
3. Confirm a session recorded under the symlink cwd also appears in the sidebar.
4. Search for both known session titles and confirm both rows remain findable.
5. Fetch `/codex-api/workspace-roots-state` and confirm local symlink roots are returned as their canonical real paths.
6. If both symlink and canonical forms have saved labels, confirm only the canonical path label is returned and displayed.
7. Add or update a workspace root through the UI using the symlink path, then reload `/codex-api/workspace-roots-state` and confirm the saved root remains in canonical form.
8. Fetch `thread/list` with multiple sessions that share the same cwd and confirm the rows still show under the canonical project.
9. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- A registered symlink root and a session cwd pointing at the symlink target are treated as the same project.
- Sessions recorded through either path form are not filtered out as unregistered workspace roots.
- Duplicate symlink/canonical labels collapse deterministically to the canonical path label.
- Workspace-root writes do not reintroduce symlink/canonical duplicates into persisted state.
- Repeated cwd values in one `thread/list` response reuse the same canonical path result and do not change visible rows.
- Search and sidebar browsing both expose the session.
- Rows remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---

### Projects survive concurrent saves and delayed refreshes

#### Feature/Change Name
Project registration must survive concurrent title, pin, queue and preference saves. A failed roots refresh preserves the last successful list, and delayed thread pages use the newest roots list.

#### Prerequisites/Setup
- Use an isolated candidate with a temporary `CODEX_HOME`; keep production state untouched.
- Register two temporary project directories, including one with no conversations.
- For delayed/failing HTTP responses, use browser network request interception on the candidate only.

#### Steps
1. Open Projects and confirm both directories appear, including the empty project.
2. Add a third project while saving a conversation title, changing a pin and adding/removing a queued message. Repeat concurrently, then reload.
3. Confirm all registered roots remain in `/codex-api/workspace-roots-state` and the state file is valid JSON.
4. After a successful list load, invalidate the roots cache by adding a project, fail the next roots GET, and refresh the thread list. Previously listed empty projects must remain visible.
5. Delay a background thread-list page, change the project list and successfully refresh it, then release the old response. The newest project list must remain visible; removed projects must not return.
6. Repeat the visible list checks in light and dark themes.
7. On the isolated candidate, save a copy of `.codex-global-state.json`, replace it with invalid JSON, then attempt a preference save. Confirm an error is returned and the invalid file is not silently replaced with a partial state. Restore the saved copy.

#### Expected Results
- Concurrent changes to unrelated state fields do not overwrite project registration.
- Readers see a complete state document during saves.
- Temporary roots failures do not remove known projects; successful explicit removal still takes effect.
- Completing an older background page does not reintroduce stale project membership.
- Refresh uses the existing requests; no extra polling or directory scan is introduced. State writes remain bounded by document size and add one atomic rename per save.

#### Automated Checks
`npm run test:unit -- src/server/globalState.test.ts src/server/codexAppServerBridge.archive.test.ts src/composables/useDesktopState.test.ts`

#### Rollback/Cleanup
Stop the isolated candidate and delete its temporary state and project directories. The state schema is unchanged; rolling back code does not require a data migration.
