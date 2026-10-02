### Expandable Projects, Pinned, and Chats sidebar sections

#### Feature/Change Name
The sidebar labels the grouped thread area as `Projects`, makes `Projects`, `Pinned`, and `Chats` independently expandable, and places `Chats` after `Projects` in the same scrollable sidebar area.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. At least one existing thread is available in the sidebar
3. At least one pinned thread exists to verify the `Pinned` section
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the app with the sidebar expanded
2. Verify the grouped thread header reads `Projects` instead of `Threads`
3. Verify `Pinned`, `Projects`, and `Chats` each show a chevron when present
4. Collapse and expand `Pinned`, confirming pinned rows hide and return
5. Collapse and expand `Projects`, confirming project groups hide and return
6. Confirm `Chats` appears after `Projects` and scrolls with the same sidebar content, not as a fixed bottom shelf
7. Collapse and expand `Chats`, confirming recent chat rows hide and return
8. Click the `Chats` filter icon and verify the existing sidebar search field opens and the filter button shows active state
9. Click the `Chats` compose icon and verify the app navigates to the new-chat/home composer
10. Open the Projects organize menu, enable `Chats first`, and verify `Chats` moves above `Projects`
11. In the same menu, switch `Sort by` between `Created` and `Updated`, then verify the active checkmark moves and the chat rows reorder by the selected timestamp
12. Refresh the page and verify `Chats first` and the selected sort mode persist
13. Switch to dark theme and repeat the visibility checks for section headers, chevrons, active filter state, sort menu state, and row text

#### Expected Results
- The sidebar uses `Projects` for the grouped project/thread area
- `Pinned`, `Projects`, and `Chats` expansion state changes immediately and persists across reload
- `Chats` is appended after `Projects` in the same scroll space
- `Chats first` moves the `Chats` section before `Projects` and persists across reload
- `Created` and `Updated` sort options update only the `Chats` ordering and persist across reload
- The filter icon toggles the sidebar search without losing the `Chats` section
- The compose icon starts a new chat using the existing new-thread flow
- Light theme and dark theme both keep section headers, controls, and rows readable

#### Rollback/Cleanup
- Clear the sidebar search query if the filter step left it open

---

### Sidebar spacing and optional navigation tabs

#### Prerequisites
- Open the sidebar with projects and chats, and settings available.

#### Steps
1. Check Projects/Chats in both normal and Chats first order, expanded and collapsed.
2. Open Settings; independently disable Show Skills tab and Show Automations tab.
3. Refresh, then re-enable each switch. Repeat in Chinese and English, light and dark themes.

#### Expected Results
- The section gap is 60px (three 20px text lines), independent of section order.
- Both tabs default to visible. Each switch immediately hides only its tab and persists after refresh.
- Settings remain reachable; re-enabling restores navigation. Labels and switches remain readable in both themes.

#### Cleanup
- Re-enable both tabs and restore the original ordering/theme/language.

#### Automated UI Check
With the current frontend preview on `http://127.0.0.1:4173`, run `node scripts/check-sidebar-preferences.cjs`. Checks independent switches, reload persistence, restoring tabs, and the 60px margin; captures 1440×1000 light/dark screenshots under `output/playwright/`. This preview check does not validate backend or chat loading.

Performance review: no new dependencies, API calls, polling, or list traversal; two preference reads at mount and one localStorage write per changed switch. Frontend typecheck/build passed.

### Hidden chat groups do not reserve project space
- Setup: one visible project and at least 19 projectless chat groups.
- Actions: inspect the gap from the last project row to Chats; collapse/reopen the project, filter search, and reorder visible projects with hidden groups interspersed. Repeat in light/dark themes.
- Expected: the rendered project container ends at its final visible project, and the actual section gap is 60px. Hidden groups reserve no height; drag order still uses the original full-list indices.
- Cleanup: restore ordering and clear search.
