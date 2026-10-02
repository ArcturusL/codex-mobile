### Codex.app-style integrated terminal

#### Feature/Change Name
Each local/worktree thread has an integrated xterm terminal that can be toggled from the header, uses the thread working directory, preserves recent output, and exposes a terminal snapshot endpoint.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. An existing local or worktree thread with a valid working directory
3. Browser focused on that thread

#### Steps
1. Click the separate `Terminal` button beside the command menu and Git branch / `Detached HEAD` control in the top-right thread header (one click, without opening a menu)
2. Confirm the bottom terminal drawer opens
3. Press `Cmd+J` on macOS or `Ctrl+J` on other platforms
4. Confirm the terminal drawer toggles closed/open
5. Run `pwd`
6. Confirm the printed path matches the thread/project working directory
7. Run `echo terminal-ok`
8. Confirm `terminal-ok` appears in the xterm output
9. Choose `npm run dev` from the `Run command` quick-command menu (use a project with this script)
10. Confirm the command is submitted to the active terminal
11. Fetch `/codex-api/thread-terminal-snapshot?threadId=<thread-id>`
12. Confirm the JSON `session.buffer` contains `terminal-ok`
13. Refresh the page and reopen the same thread
14. Toggle the terminal open again
15. Click `New`
16. Confirm a second terminal tab appears and becomes active
17. Click the first terminal tab
18. Confirm its previous output is restored
19. Resize the browser window
20. Click `Close`
21. Open the new-chat screen
22. Confirm a working folder is selected
23. Click the terminal button in the top-right header
24. Confirm the terminal opens below the new-chat composer before a thread exists
25. Run `pwd` and confirm it matches the selected folder
26. Repeat the header checks in light and dark themes, with both a normal branch and detached HEAD
27. On an isolated host without native PTY support, click `Terminal`; confirm the button remains visible, the panel explains the attach failure, and clicking the button again hides it
28. On new-chat without a selected folder, and on Skills / Automations, confirm the terminal controls are absent

#### Expected Results
- The terminal button shows a pressed state when the drawer is open
- The terminal is scoped to the selected thread working directory
- The terminal button is also available on new-chat when a working folder is selected
- New-chat terminal sessions use the selected folder before a thread exists
- Recent output is restored after hiding/reopening or refreshing the thread
- The terminal resizes without clipping the prompt
- The snapshot endpoint returns `{ session: { cwd, shell, buffer, truncated } }` while a session exists
- The quick-command menu sends common project commands such as `npm run dev` into the current PTY
- The separate terminal button toggles the panel directly; the open/hide action also remains the first item in the `Run command` menu
- The `Run command` menu shows discovered project commands in usage order and scrolls when the list is longer than the visible menu
- Missing native PTY support produces a visible panel error instead of silently removing the entry point
- `New` adds another tab without killing the previous PTY
- `Close` terminates the active PTY and hides the drawer only after the last tab is closed

#### Rollback/Cleanup
- Close the terminal session with the `Close` button
- Stop any processes started inside the terminal before leaving the thread

---
